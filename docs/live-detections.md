# Live detections on Edge

The first live overlay is enabled for **Little Caesars 1**. The shared receiver
continues to provide the clean HLS video. A single GPU worker publishes object
positions and local tracking IDs; viewers draw a transparent canvas over the
existing video element. Showing, hiding or filtering boxes does not recreate
the HLS player. No inference runs per viewer.

The demo labels native detector classes: person, car, motorcycle, bus and truck.
Vehicle subtype/color classification, historical object search, cross-camera
identity and the conversational UI are separate future work. Native IDs identify
a track within one camera/session, not a persistent physical identity.

## Metadata and synchronization

Authenticated endpoints, including the `/edge` mount:

- `GET /api/live/detections?camera=little1`: worker state.
- `GET /api/live/detections/events?camera=little1`: SSE `state` and `frames` events.
- Existing live bootstrap includes `camera.detections` only when a worker has
  published state for that camera. Other cameras keep their existing playback.

The channel uses the existing session and role checks, periodically revalidates
the session, shares bounded connection slots and reconnects before the external
proxy timeout. `Last-Event-ID` recovers missed packets. Metadata is private and
never contains source camera credentials or filesystem paths.

Each observation includes camera/session, HLS segment filename, exact presentation
offset within that segment, normalized boxes, native class/confidence, image
dimensions and applied region revision. Dates are reception/program time;
camera wall clocks remain uncalibrated.

The client matches the segment to **decoded video timestamps**, then uses
`requestVideoFrameCallback().mediaTime` for painting. It does not align boxes to
the arrival time of an SSE message or to a fixed assumed latency. Geometry is
interpolated only between the same ID/session/region revision; labels come from
the current or earlier observation. Unknown segments, invalid coordinates and
observations over 280 ms old are hidden. Empty observations clear prior boxes.

Canvas coordinates account for the displayed video rectangle, letterboxing and
device pixel ratio. The custom fullscreen button includes both video and canvas.
The first integration is validated with Hls.js in Chromium, including a narrow
mobile viewport. If a browser uses native HLS without fragment timing metadata,
the video remains playable and boxes wait for a supported synchronization clock.

Playback pause and short seeks work within buffered live video. Longer review
continues through the existing history view; saved archive clips do not yet have
this live overlay. HLS may return to the live window when an old position is no
longer available.

## Worker and operation

Host project: `/home/paal/Projects/senttra-live`.

- Worker: `live_detector.py`, managed by `senttra-live-detections.service`.
- Input: the existing receiver on loopback port 18888; no new camera connection.
- Model: the existing verified YOLO26x weights/options and BoT-SORT, sampling ten
  observations per second. The lost-track buffer represents one sampled second.
- Areas: the saved validated profiles, applied after detection and before
  tracking, with exclusions taking precedence. A saved revision change resets
  the tracking session at a segment boundary.
- Queue: at most three completed segments; excess backlog is skipped explicitly
  and resets tracking. Stream restart/gaps also reset local identities.
- Metadata: `data/live-detections/live.sqlite3`, SQLite WAL, private permissions,
  180 seconds and at most 4,000 observations. This is a bounded live display
  buffer, not the historical object database proposed for later search.
- Operational health: `/healthz/detections`, only an `ok` flag and service name.
  Camera names, positions and frames require authentication.

Backend installation and restart use the existing ops lock and preserve the
receiver, camera configuration, stored recordings and saved regions. Rollback:
revert this frontend change, stop/disable only `senttra-live-detections.service`,
and restore only the changed backend files from the scoped backup. The shared
Caddy configuration does not change.

## Validation

`node --test tests/live-detections.test.mjs tests/edge-replay.test.mjs` covers
separate media clocks, no future labels, stale/empty data, identity resets,
reconnect deduplication, bounded memory and letterboxing. The backend tests cover
PTS sampling, HLS path restrictions, retention, cursors, auth, SSE and health.

`tests/live-overlay.browser.mjs` runs against an isolated signed-login fixture
with actual shared video and actual GPU detections. It checks alignment across
segments, transparent clearing, preserved video identity, pause, buffered seek,
filters, fullscreen, mobile layout, network recovery and logout. The fixture
uses temporary identities, not user sessions.

The browser check defaults to a device pixel ratio of 0.8 (override with
`EDGE_TEST_DPR`). It marks the entire right and bottom edges and verifies the next
frame clears them, catching stale trails that only appear below a ratio of 1.

API references: [video frame callbacks](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback)
and [SSE](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events).
