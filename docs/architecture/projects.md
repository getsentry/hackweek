# Projects, groups, and attachment behavior

The Cloudflare application preserves the useful legacy project information architecture while
making authorization explicit at the Worker boundary.

## Intentional behavior

- A year with `submissions_closed = 1` is read-only. Historical projects, ideas, empty teams,
  and records without media or video remain browseable.
- New ideas have no group, team, help request, or attachment. Any authenticated member can
  claim an unclaimed idea while submissions are open; claiming atomically changes it into a
  project and adds the claimant to the team.
- A project must reference a group from the same year. A creator is included in a newly
  created project's team by default. Members, the creator, and administrators can edit an
  open project and manage its team; only the creator or an administrator can withdraw it.
- Delete is a soft withdrawal rather than destructive removal so historical relationships
  remain intact. Group deletion is an administrator action and atomically clears references
  from projects instead of deleting those projects.
- The legacy behavior that allowed any authenticated user to overwrite an unclaimed project
  has been narrowed to the explicit claim action. Client state never grants write access.

## Private attachments

Attachment metadata lives in D1 and bytes live in the private `ATTACHMENTS` R2 binding at:

```text
projects/<project-id>/media/<media-id>/<sanitized-original-name>
```

The project and media IDs make keys deterministic and collision-resistant for migration and
reconciliation. Browser users never receive a public bucket URL. Authenticated downloads go
through `/api/media/:id/content` with private caching and attachment response headers. Uploads
are bounded to 25 MiB and pass through the Worker because an R2 binding cannot mint browser
presigned S3 requests without introducing separate S3 credentials; demo videos and other
large media use the later direct-to-Stream path instead. A failed upload is retained as failed
metadata for visibility, and a missing R2 object marks its D1 row missing.

Video URLs and embeds are intentionally absent from this slice. A project or idea without a
video is a valid complete record; Stream lifecycle and playback are added separately.
