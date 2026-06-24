# attachments

Standard-tier plugin — issue attachments: the R2 blob + its D1 metadata row. **The single owner of R2.**

- **Depends:** `storage` (R2) · `d1` · `realtime`
- **Config:** `{ storage, attachmentPrefix }` (defaults `"attachments"` / `"attachments/"`)
- **API:** `add` · `listForBoard` · `listForIssue` · `getForDownload` · `remove` · `purgeForCascade`
- **Events:** `attachments:added`, `attachments:removed` (hooked by `activity`)

Attachment rows **denormalize `board_id` + `department_id`** so `purgeForCascade` is one indexed query
at any cascade level. `boards`/`issues`/`departments` call `purgeForCascade` **inline before** their own
deletes (D1 `ON DELETE CASCADE` fires before any hook can read child rows); it is best-effort + silent.