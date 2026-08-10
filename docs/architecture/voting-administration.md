# Voting and administration

The legacy Firebase rules and `src/voting.js` established these retained rules:

- voting must be enabled for the selected year;
- one vote key exists per voter, year, and category;
- a project member cannot vote for their own project;
- projects and categories referenced by a vote must belong to that year;
- a project has at most two distinct category nominations;
- year, group, category, award, and voting configuration changes are admin-only.

The Cloudflare implementation enforces these rules twice where concurrency matters: Hono validates request shape and centralizes D1-backed admin authorization, while D1 foreign keys, unique indexes, and triggers enforce referential, nomination, vote, award, and screening invariants at commit time. Concurrent duplicate votes therefore cannot pass the unique `(year_id, creator_id, award_category_id)` key. A deliberate vote move uses an owned vote ID and a constrained update; blind last-write-wins replacement is not supported.

## Intentional changes

- Nominations are normalized rows rather than two nullable project fields. The API replaces both rows in one D1 batch.
- Awards are limited to one winner per category and year, matching the legacy administration UI that filtered already-used categories.
- Category deletion is rejected while referenced rather than cascading historical votes or awards. Operators must resolve those records explicitly.
- Screening order is stored independently from `project_videos`, so active-project ordering remains valid while video is disabled. If real Stream is separately approved, only ready videos enter that order for playback.
- Analytics use bounded D1 aggregate queries. The browser receives year totals and per-project/category counts, never raw voters or the full historical database.
- The voting page emphasizes nominated projects in each category. Projects with no nominations remain eligible in every category, preserving the legacy "No Category" voting escape hatch without reproducing Firebase grouping state.
