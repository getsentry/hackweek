# Architecture

## System

Hackweek is a Cloudflare-native modular monolith:

```text
Cloudflare Access -> Worker/Hono API -> D1
                         |             -> private R2 attachments
React/Vite Static Assets |             -> Stream control API
Browser -----------------+-----------> Stream tus/HLS directly
GitHub jobs -------------------------> measurement/archive service APIs
```

- `src/app` is a React 19 SPA using Wouter and TanStack Query. It retains the Sentry `#HACKWEEK` masthead, Rubik voice, ink/blurple palette, squiggle, archive banners, compact controls, and responsive project hierarchy.
- `src/worker` is the only application API. It validates identity, resolves D1 users/roles, enforces business rules, and uses typed D1/R2/Stream boundaries.
- `migrations` owns the normalized D1 schema. Source IDs are retained for deterministic one-off migration and stable links.
- `scripts/migrate` transforms operator-provided database/storage exports, imports deterministic D1/R2 records, and reconciles counts, references, paths, sizes, and checksums.
- Stream video bytes never traverse the Worker. The Worker provisions constrained tus uploads, authenticates replay-safe lifecycle events, issues protected playback, and exposes service-authenticated job queues.

The official Cloudflare Vite plugin builds one Worker with Static Assets; [`architecture/toolchain.md`](architecture/toolchain.md) records the verified Vite+ decision.

## Data and authorization boundaries

Cloudflare Access authenticates staging users; `AUTH_MODE=local` is a loopback-only development convenience. Neither Access claims nor the browser can grant application roles. D1 `users.is_admin` is the role authority. Worker middleware and D1 constraints protect:

- company-domain profiles and stable Access subjects;
- current-year project/team/group/media permissions;
- voting enabled state, same-year references, one vote per user/category, and self-project rejection;
- administrator-only years, groups, categories, nominations, awards, analytics, and screening order;
- one primary video per project, valid lifecycle transitions, replay-safe events, ready-only playlists, and gain bounds.

R2 is private. Attachment downloads pass through authorization; demo upload and playback travel directly between browser and Stream. Secrets are Worker/GitHub environment values, never Vite client variables or tracked config.

## Core data

`users`, `years`, `groups`, `projects`, `project_members`, `award_categories`, `project_nominations`, `votes`, `awards`, `media`, `project_videos`, `stream_events`, and `screening_order` are normalized D1 tables. Foreign keys, uniqueness, checks, and triggers are the final concurrency boundary. See the SQL migrations and focused domain notes:

- [`architecture/projects.md`](architecture/projects.md)
- [`architecture/voting-administration.md`](architecture/voting-administration.md)
- [`video-operations.md`](video-operations.md)

## Legacy feature inventory

Git history, not deployed source compatibility code, preserves the removed application. There is no dual-write, legacy router, Firebase SDK, Hosting config, database/storage rules, or Firebase deploy workflow in the runtime tree.

| Legacy route/domain                      | Replacement                                                   | Intentional change                                                                                   |
| ---------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `/login`                                 | Cloudflare Access before the app; `/api/session` profile sync | no client Google/Firebase login page                                                                 |
| `/years`                                 | `/years`                                                      | preserved archive, banners, counts, awards                                                           |
| `/projects`, `/years/:year/projects`     | `/years/:year/projects`                                       | explicit year routes; bounded API queries instead of subscriptions                                   |
| `/new-project`                           | `/years/:year/projects/new`                                   | server-authorized current-year create                                                                |
| project detail/edit/title aliases        | `/years/:year/projects/:id` and `/edit`                       | stable source ID; no decorative-title alias                                                          |
| project members/groups/media             | typed project APIs + D1/R2                                    | private R2 media and atomic normalized membership                                                    |
| `/voting`, `/years/:year/voting`         | `/years/:year/vote`                                           | explicit vote move; D1 blocks duplicates/self/cross-year/disabled votes                              |
| `/admin` and nested year screens         | `/admin/years/:year`, `/admin/analytics`                      | one coherent admin page plus aggregate-only analytics                                                |
| project `videoUrl` preview               | primary Stream video + project/watch permalink                | only selected historical videos are promoted; no automatic bulk Stream import                        |
| none                                     | `/years/:year/watch`                                          | ordered ready-only screening, title cards, dual preload, keyboard/fullscreen controls, measured gain |
| Firebase realtime listeners              | TanStack Query request/cache                                  | realtime parity intentionally not reproduced                                                         |
| Firebase Hosting/Database/Storage deploy | Worker Static Assets + D1 + R2                                | deployment is separately approved and staging-gated                                                  |

Projects and ideas without video remain complete. Missing migration relationships are reported without dropping unrelated records. Historical media all migrates to R2; only operator-selected old videos enter Stream.

## Verification boundaries

`npm run verify` proves local code, schema, migration fixtures, D1/R2 behavior, fake Stream contracts, and frontend/controller journeys. It cannot prove remote Cloudflare capabilities. Staging must separately demonstrate Access denial/identity, real bindings, tus resume, webhook delivery, HLS tokens, Web Audio output, one selected historical video, and archive integration. Never use local evidence to claim those checks.
