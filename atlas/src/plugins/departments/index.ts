/**
 * Standard tier — the top-tier "contents page" department index (emit-only).
 *
 * Owns the `departments` table + CRUD. No realtime dep (above the per-board channel tier). On delete,
 * calls attachments.purgeForCascade({ kind: "department", id }) inline before the D1 delete. Emits
 * departments:created / renamed / reordered / deleted.
 *
 * @see README.md
 */
import { createPlugin, d1Plugin } from "@moku-labs/worker";
import { attachmentsPlugin } from "../attachments";
import { createDepartmentsApi } from "./api";
import type { DepartmentsEvents } from "./types";

export const departmentsPlugin = createPlugin("departments", {
  depends: [attachmentsPlugin, d1Plugin],
  // eslint-disable-next-line jsdoc/require-jsdoc -- structural event registrar (spec/14 §2)
  events: register =>
    register.map<DepartmentsEvents>({
      "departments:created": "A department was created",
      "departments:renamed": "A department was renamed",
      "departments:reordered": "A department was reordered",
      "departments:deleted": "A department was deleted"
    }),
  // eslint-disable-next-line jsdoc/require-jsdoc -- inline api factory required when events are declared (spec/15 §4)
  api: ctx => createDepartmentsApi(ctx)
});
