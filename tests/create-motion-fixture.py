"""Generate the decoded-pixel fixture using only Python stdlib and ffmpeg.

python3 tests/create-motion-fixture.py /tmp/motion.mp4
EDGE_MOTION_VIDEO=/tmp/motion.mp4 node tests/overlay-motion.browser.mjs
"""
import math
from pathlib import Path
import subprocess
import sys

target = Path(sys.argv[1])
target.parent.mkdir(parents=True, exist_ok=True)
encoder = subprocess.Popen([
    'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo',
    '-pixel_format', 'rgb24', '-video_size', '640x360', '-framerate', '30',
    '-i', 'pipe:0', '-an', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '10',
    '-threads', '2', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(target),
], stdin=subprocess.PIPE)
try:
    for index in range(360):
        center = .45 + .29 * math.sin(index / 30 * 1.2)
        left, right = round((center - .07) * 640), round((center + .07) * 640)
        frame = bytearray([20]) * (640 * 360 * 3)
        row = bytes([255]) * ((right - left) * 3)
        for y in range(144, 234):
            frame[(y * 640 + left) * 3:(y * 640 + right) * 3] = row
        encoder.stdin.write(frame)
finally:
    encoder.stdin.close()
if encoder.wait() != 0:
    raise RuntimeError('Motion fixture encoding failed')
