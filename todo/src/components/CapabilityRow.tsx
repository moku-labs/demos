/**
 * @file CapabilityRow — one capability's last answer. `data-capability` and `data-status` are the
 * contract an end-to-end test or a simulator screenshot reads, so they carry the raw names the
 * system framework uses, never a prettified label.
 */
import type { JSX } from "preact";
import type { CapabilityRowProps } from "./types";

/**
 * Render one diagnostics row.
 *
 * @param props - The row props.
 * @param props.row - The capability's last known result.
 * @returns The row.
 * @example
 * ```tsx
 * <CapabilityRow row={{ name: "tray", provider: "web", status: "unsupported", message: "" }} />
 * ```
 */
export function CapabilityRow({ row }: CapabilityRowProps): JSX.Element {
  return (
    <div data-component="capability-row" data-capability={row.name} data-status={row.status}>
      <span data-name>{row.name}</span>
      <span data-provider>{row.provider.length > 0 ? row.provider : "—"}</span>
      <span data-result>
        {row.status}
        {row.message.length > 0 ? ` — ${row.message}` : ""}
      </span>
      <button type="button" data-action="test" data-capability={row.name}>
        Test
      </button>
    </div>
  );
}
