// Optional bounded loopback fixture: real fragmented MP4 ranges at ~3.7 Mbit/s.
// Public-bundle tests proxy only frontend assets; camera APIs remain Playwright fixtures.
import { createServer, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { createReadStream, statSync } from 'node:fs';
import { once } from 'node:events';

export async function slowRecordingGateway(upstream, file) {
  const size = statSync(file).size;
  const server = createServer(async (req, res) => {
    if (req.url !== '/slow-recording.mp4') {
      const target = new URL(req.url, upstream);
      const request = (target.protocol === 'https:' ? httpsRequest : httpRequest)(target, response => {
        res.writeHead(response.statusCode, response.headers); response.pipe(res);
      });
      request.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
      res.on('close', () => request.destroy()); request.end(); return;
    }
    const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? '');
    const start = match ? Number(match[1]) : 0, end = match?.[2] ? Number(match[2]) : size - 1;
    if (start > end || end >= size) { res.writeHead(416); res.end(); return; }
    res.writeHead(match ? 206 : 200, { 'Content-Type': 'video/mp4', 'Content-Length': end - start + 1,
      'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store', ...(match ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}) });
    const stream = createReadStream(file, { start, end, highWaterMark: 65536 });
    res.on('close', () => stream.destroy());
    try {
      for await (const chunk of stream) {
        await new Promise(resolve => setTimeout(resolve, 140));
        if (res.destroyed) break;
        if (!res.write(chunk)) await new Promise(resolve => {
          const done = () => { res.off('drain', done); res.off('close', done); resolve(); };
          res.once('drain', done); res.once('close', done);
        });
      }
      if (!res.destroyed) res.end();
    } catch { if (!res.destroyed) res.destroy(); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  return { origin: `http://127.0.0.1:${server.address().port}`,
    close: async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}
