# departments

Standard-tier plugin — the top tier of the hierarchy: the numbered "contents page" index.

- **Depends:** `attachments` · `d1` (**no** `realtime` — emit-only, above the per-board channel tier)
- **Config:** none
- **API:** `list` · `create` · `rename` · `reorder` · `delete`
- **Events:** `departments:created` · `:renamed` · `:reordered` · `:deleted` (hooked by `activity`)

`delete` order is load-bearing: `attachments.purgeForCascade({ kind: "department", id })` **then** the
D1 delete (CASCADE removes the rows the purge reads). `list` returns `Department[]`; the
`GET /api/departments` endpoint merges it with `customize.getCustomizationsForDepartments`.

> Skeleton stub — `api.ts` throws `not implemented`; CRUD lands during the build wave.
