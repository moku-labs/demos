# issues

Complex-tier plugin — the article-style Issue entity. The richest plugin in Atlas.

- **Depends:** `realtime` · `attachments` · `d1`
- **Config:** none
- **API (3 sub-domains, flat surface):**
  - issue core — `listForBoard` · `getDetail` · `create` · `move` · `update` · `delete`
  - sub-issues — `addSubIssue` · `toggleSubIssue` · `removeSubIssue`
  - properties — `setProperties`
- **Events:** 8 × `issues:*` (hooked by `activity`)

Owns four D1 tables (`issues`, `sub_issues`, `issue_labels`, `issue_assignees`). The issue
**description is stored verbatim as markdown** — it is **never** rendered or HTML-escaped server-side;
the single render-time XSS gate is the client `lib/markdown.ts` vnode renderer + href scheme allowlist.
`delete` calls `attachments.purgeForCascade({ kind: "issue", id })` inline before the D1 delete.

`api.ts` composes `createIssueCrud` + `createSubIssueApi` + `createPropertyApi` into the flat `Api`
(the reason this is Complex, not Standard).

> Skeleton stub — every factory throws `not implemented`; the three sub-domains land during the build wave.
