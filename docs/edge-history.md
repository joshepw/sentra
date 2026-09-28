# Private camera history in Edge

The chat above the camera map searches the edge computer's durable observation
index. A selected analysis supplies dates for questions such as “pailas rojas
de este tramo”. Explicit dates, including “ayer”, use Honduras time and remain
separate from that selection. Results count appearances per camera/tracking
session; they do not establish unique physical vehicles.

The edge backend supplies six read-only MCP tools: coverage, current reception,
vehicle search, candidate incident search, opening a result, and appearance
comparison across cameras. Arguments are bounded and validated by the backend.
The model has no arbitrary SQL, shell, or file access. Search totals are rendered
from database results. Missing or partial coverage is shown separately.

Voice input uses MediaRecorder, with a 59-second client limit and a 4 MiB limit.
The edge computer decodes and transcribes it with Whisper, asks local Gemma to
select a tool, and returns text plus local TTS audio. Reply audio attempts to
play automatically and keeps native playback controls when browser policy
blocks autoplay. Voice can be disabled independently of text queries.

API requests use the existing same-origin `/edge/api` and `/edge/media`
rewrites. Backend sessions protect every route; POST requests also require the
existing CSRF token and exact Origin. Job status and audio are scoped to the
session subject. No new browser-visible credential is introduced.

Relevant backend routes:

- `GET /api/history/coverage`, `/search`, `/incidents`, `/similar`, `/frames`
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
