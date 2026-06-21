# customize

Standard-tier plugin — the **universal** colour/icon customization for every element type
(department · board · column · issue).

- **Depends:** `d1` · `realtime`
- **Config:** none (the table + element-type union are fixed).
- **API:** `set` · `getCustomizationsForBoard` · `getCustomizationsForDepartments`
- **Events:** `customize:changed` (hooked by `activity`)

One `customizations` table keyed by `(element_type, element_id)` with a denormalized `board_id` (NULL for
departments) so `getCustomizationsForBoard` is one indexed query. `set` upserts (NULL clears a field);
board-scoped changes broadcast `{ type: "customized" }`, department changes do not.

> Skeleton stub — `api.ts` throws `not implemented`; the upsert + scoped reads land during the build wave.
