# Private camera history in Edge

The bottom text/microphone bar searches the edge computer's durable observation
index. Questions without dates use the live analysis and its latest 24 hours.
Explicit dates, including “ayer”, use Honduras time and can search older archives
without inheriting the live analysis filter. Results count appearances per camera/tracking
session; they do not establish unique physical vehicles.

The edge backend supplies eight read-only MCP tools: coverage, current reception,
vehicle search, person/shirt search, candidate incident search, opening a result,
opening a camera at a date/time, and appearance comparison across cameras.
Arguments are bounded and validated by the backend.
The model has no arbitrary SQL, shell, or file access. Search totals are rendered
from database results. Missing or partial coverage is shown separately.

Voice input uses MediaRecorder, with a 59-second client limit and a 4 MiB limit.
The edge computer decodes and transcribes it with Whisper, asks local Gemma to
select a tool, and returns text plus local TTS audio. Reply audio attempts to
play automatically and keeps native playback controls when browser policy
blocks autoplay. Voice can be disabled independently of text queries.

Recording opens a fullscreen native dialog with a microphone, elapsed time and
waveform driven by the captured audio stream through a Web Audio analyser.
Cancel/Escape discards the audio and stops the tracks, including permission
requests that resolve after cancellation. Sending, capture failure and unmounting
also release the microphone. The existing 59-second limit still sends the audio
automatically; the dialog explains this before the limit is reached.

While a job runs, the results panel shows its actual backend phase and a small
animated activity indicator. Decorative phrases rotate every three seconds within
that phase; they do not simulate completed work or estimate a percentage. On phones
the indicator uses a compact row. Reduced-motion preferences disable decorative
animation, and changing phrases are kept out of screen-reader announcements.
Video loading uses the same visual language inside the player, with distinct
connection, buffering and reconnection labels. Script failure and autoplay blocking
offer explicit recovery actions. Loading overlays preserve the video element.

API requests use the existing same-origin `/edge/api` and `/edge/media`
rewrites. Backend sessions protect every route; POST requests also require the
existing CSRF token and exact Origin. Job status and audio are scoped to the
session subject. No new browser-visible credential is introduced.

Relevant backend routes:

- `GET /api/history/coverage`, `/search`, `/incidents`, `/similar`, `/frames`, `/recording`
- `POST /api/history/chat`; `GET /api/history/chat/{job}`
- `POST /api/history/mcp` for JSON-RPC initialize/tools/list/tools/call
- `POST /api/history/review` for an explicit reviewer decision
- `GET /media/history/thumbs/{id}.jpg`, `/clips/{id}.mp4`, `/voice/{job}.wav`

The result player uses the original archive segments and captured timestamps.
Geometry may interpolate within one tracking session; labels come from the
preceding observation. Gaps clear boxes. Incident trajectories stop at the
playback time. Review decisions retain the original candidate evidence.
Cross-camera cosine similarity produces suggestions, never a confirmed identity.

Validation: `npm run build`, ESLint on the changed files, and
`node --test tests/*test.mjs`. `tests/history-chat.browser.mjs` expects an isolated
signed-auth fixture, representative archived data, and the local voice/model
services. It tests session protection, pagination, causal overlays, pause/seek,
range requests, candidate review in the fixture, microphone input, automatic
reply audio, explicit dates outside coverage, mobile width and logout.

Deployment requires the matching history/chat backend before this frontend.
Rollback can revert the frontend commit independently; retaining the durable
history and original recordings preserves all collected data.

## Conversational viewer prototype

Each question includes the current camera, box visibility, live analysis/filter context
and ordered IDs of the visible cards. Numbered references use that list, including
an empty list, so an older conversation cannot silently reopen an old result.
Refining a search preserves its existing filters. Conversations are scoped to a
browser instance as well as the authenticated user.

The assistant can select a camera, show all cameras, toggle boxes, close the result
player, open a numbered card, move to the next/previous result, pause/resume and
seek by seconds, minutes or hours in either direction (up to 31 days per command).
These are validated browser actions. A job pauses
at `waiting_action`; the client checks the view revision, applies the action, then
posts `chat/{id}/applied`. Text and speech confirm only after that receipt. A
changed view rejects the action. Existing read-only MCP tools remain available;
they do not gain filesystem or service-control access.

The result video occupies the main panel, beside a separately scrolling numbered
list (below it on mobile). The camera map and search filters stay visible. The
composer stays at the bottom and the conversation expands above it. Response audio
pauses during recording or a new request. Box visibility is shared with the live
viewer and does not replace the playing video element. Original video and metadata
paths are unchanged.

The corridor map stays above the video, beside a compact hourly traffic chart.
On phones, this overview scrolls horizontally; the video and composer keep their
own space. The live camera card omits the old box/filter/fullscreen toolbar and
archive/encoding footer. Detection visibility remains part of the shared viewer
state and voice commands. Map zoom survives camera-status polling.
Camera selection uses the map or assistant; the standalone camera dropdown and
live/history buttons are omitted. The header keeps only the sign-out action.
The period selector and analysis-status row are also omitted. Coverage polling
selects the live analysis for the chart and new undated searches; it does not
silently fall back to an archived period. Explicit dated searches remain available
through the assistant, with their dates shown in the result filters.

The chart uses the selected camera and live analysis, limited to the latest
24 observed hours for longer analyses. It reads totals from the existing search
and incident endpoints with at most two concurrent requests and an in-memory
cache; paginated item counts are never used as totals. Vehicle counts are
appearances, and the second series contains pending candidate incidents. Failed
counts remain unknown and can be retried. No new backend route is required.
At initial load, chart requests wait for the first live video frame, with a
five-second fallback for cameras that cannot start. Stream quality and the existing
playback reserve are unchanged; a production startup-time improvement has not yet
been measured.

`tests/edge-layout.browser.mjs` checks desktop/mobile sizing, camera selection,
map continuity and independent result scrolling with browser-isolated API
responses and an `EDGE_TEST_VIDEO` local MP4. It does not access production APIs.
`tests/edge-feedback.browser.mjs` uses the same isolated local app and MP4 with
synthetic microphone audio. It checks voice activity, cancellation/permission races,
track cleanup, phase changes, video continuity, mobile sizing, reduced motion,
chart request ordering and player-script failure without contacting production.

Next-result navigation loads the following page when necessary and reports the end
of the list. Relative seeks preserve pause across archive segments and wait for the
browser's seek to finish. Missing intervals and playback failures return failure
receipts, without spoken success. Result navigation requires a selected result in the current
list. Validate this layout with `tests/investigation-viewer.browser.mjs` and the
matching backend chat regressions; the fixture uses an isolated identity and a
copy of the index, with original video and local Whisper/Gemma/TTS.

## Camera and time playback

“Mostrame Little Caesars a las 7 de la mañana” calls `abrir_grabacion` with
`camera: "little"` and `time: "07:00:00"`. The optional `date` is `YYYY-MM-DD`;
omitting it means today in `America/Tegucigalpa`, independently of the current
search or analysis. Explicit dates and “ayer” keep their requested local date.
Times use the archive's reception clock. “Little Caesars 1” identifies `little1`.

The tool checks the original recording catalog, verified file and internal gaps.
It returns the exact playback timestamp and segment ID without requiring a
vehicle, incident or detection run. A matching run is optional for overlays.
Missing, future or unverified footage produces an explicit unavailable result;
the browser keeps the previous video and search cards. Opening recordings is not
restricted by the daytime policy for vehicle searches.

The chat sends an `open_archive` action. The browser confirms it only after the
requested segment has decoded and the seek has finished at the requested instant,
without the pre-roll used by search results. Loading failures and intervening view
changes return failure/stale receipts. Pause, play and relative seek also work
on directly opened recordings; next/previous still refer to search results.

Relative seeks use the actual video position when the action is applied. A request
such as “20 minutos para enfrente” becomes `controlar_video` with `seconds: 1200`.
When the destination is outside the loaded segments, the player calls the protected
`GET /api/history/recording?camera=…&at=…` resolver, then fetches a small archive
window around that timestamp. It preserves fractional seconds and pause/play,
loads the destination's optional analysis, and waits for the seek before confirming.
No intervening 20-minute download is needed. Missing footage or failed lookups keep
the previous recording; a closed or changed player cancels the pending seek.

`tests/camera-time.browser.mjs` verifies exact opening, receipt timing, repeated
requests, controls across segments, missing footage, preserved results, stale
actions, media failure and mobile sizing. APIs and MP4 ranges use local fixtures,
including when checking the published bundle. The matching backend tests cover
Honduras midnight, dates, gaps, optional detections and authenticated MCP access.
