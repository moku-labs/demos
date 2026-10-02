/**
 * @file SystemPanel — the verification surface. It states which runtime the system app selected and
 * what each capability last answered, with a probe per row and one for all of them. It renders the
 * rows it is given; nothing here asks where the app is running.
 */
import type { JSX } from "preact";
import { CapabilityRow } from "./CapabilityRow";
import type { SystemPanelProps } from "./types";

/**
 * Render the System panel.
 *
 * @param props - The panel props.
 * @param props.rows - One row per capability.
 * @param props.kind - Shell kind reported by the system app.
 * @param props.platform - OS platform reported by the system app.
 * @param props.open - Whether the panel is expanded.
 * @returns The panel.
 * @example
 * ```tsx
 * <SystemPanel rows={rows} kind="tauri" platform="macos" open />
 * ```
 */
export function SystemPanel({ rows, kind, platform, open }: SystemPanelProps): JSX.Element {
  return (
    <details data-component="system-panel" open={open}>
      <summary data-panel-toggle>System</summary>

      <p data-runtime>
        runtime <b data-kind>{kind.length > 0 ? kind : "…"}</b> ·{" "}
        <b data-platform>{platform.length > 0 ? platform : "…"}</b>
      </p>

      <div data-rows>
        {rows.map(row => (
          <CapabilityRow key={row.name} row={row} />
        ))}
      </div>

      <button type="button" data-action="run-all">
        Run all
      </button>
    </details>
  );
}
