# boards

Standard-tier plugin — the middle of the hierarchy: `boards` + `columns`, plus a KV index for fast listing.

- **Depends:** `realtime` · `attachments` · `kv` · `d1`
- **Config:** `{ boardsKv, boardIndexKey }` (defaults `"boards"` / `"boards:index"`)
- **API:** board CRUD (`listForDepartment`, `getBoardWithColumns`, `create`, `rename`, `reorder`, `delete`) + column CRUD (`createColumn`, `renameColumn`, `reorderColumn`, `deleteColumn`)
- **Events:** 8 × `boards:*` (hooked by `activity`)

`create` seeds the default Backlog / In Progress / In Review / Done columns. `create`/`reorder` are
list-level (KV + emit, no broadcast); board-scoped ops broadcast to the board's DO channel.
`delete`/`deleteColumn` call `attachments.purgeForCascade` inline before the D1 delete.
`getBoardWithColumns` is the board+columns slice the `GET /api/boards/{id}` endpoint merges into `BoardSnapshot`.