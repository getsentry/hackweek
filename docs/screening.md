# Screening operations

## Before screening day

- Complete every staging video check in [`video-operations.md`](video-operations.md); local fake Stream is insufficient.
- Use a supported company browser and validate both hls.js and native-HLS behavior where applicable.
- In admin, save the intended project order. Only `ready` videos with measured/clamped gain enter the reel; missing, uploading, processing, measuring, and failed rows stay excluded.
- Open each individual permalink, then run **play all** from start to finish. Confirm title cards, N+1 preload, `ended` advancement, final completion, and no raw UID playback.
- Verify one AudioContext, a GainNode per video element, the shared compressor/limiter, and audible normalization. Gain is `10 ** (gain_db / 20)` with server-provided `gain_db` bounded to -12…12.
- Run a Meet-style screen-share rehearsal with **share tab audio** enabled. Confirm fullscreen, audio routing, resolution, corporate browser policy, sleep settings, and network capacity.
- Prepare a second authenticated presenter device and a written list of individual video permalinks.

## Controls and state

Playback starts only after the operator presses **play all**, satisfying the browser user-gesture/AudioContext requirement.

| Control      | Keyboard    | Behavior                                        |
| ------------ | ----------- | ----------------------------------------------- |
| pause/resume | Space       | pauses or resumes the active media element      |
| skip         | Right Arrow | explicitly advances to the next title card/clip |
| fullscreen   | `f`         | requests fullscreen for the screening surface   |

Two video elements ping-pong. While clip N plays, protected playback for N+1 is requested and attached to the inactive element. Normal progression occurs from the active element's `ended` event, never a background timer. A short timer controls only HTML/CSS title-card presentation.

Player states are `idle`, `loading`, `title`, `playing`, `paused`, `complete`, and `error`. If playback issuance or media attachment fails, stop and diagnose; do not silently skip a project. Local fake playback intentionally enters an error because it has no HLS manifest.

## Screening-day checklist

- [ ] Access and `/api/health` are available from the presentation network.
- [ ] Admin order matches the approved running sheet.
- [ ] Every expected project is ready; investigate any omitted project before starting.
- [ ] Protected tokens issue, raw UID URLs fail, and the first two manifests preload.
- [ ] AudioContext resumes after **play all**; measured gain and limiter are active.
- [ ] Pause, skip, fullscreen, title cards, and individual permalinks work.
- [ ] Meet/tab-audio rehearsal passes on the actual presenter machine.
- [ ] Backup presenter is authenticated and the permalink list is available.
- [ ] Stream/Worker observability and an incident contact are open.

## Incident handling

1. Pause playback and record the project/video ID and visible error.
2. If one clip is bad, use the approved individual permalink list for the next valid clip; do not mutate D1 video status manually.
3. If signed playback fails broadly, verify Access/session, Stream token issuance, allowed origin, and account status. Do not expose an unsigned manifest as a workaround.
4. If audio graph/Meet sharing fails, switch to the rehearsed backup presenter. Do not increase gain beyond the clamp.
5. If the Worker or Stream is unavailable, stop the screening rather than claim partial success. Follow the staging/cutover incident owner and preserve logs.
6. Failed measurement is retryable through the project UI/job. Archive failure does not block screening readiness.
