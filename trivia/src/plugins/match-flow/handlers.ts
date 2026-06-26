/**
 * @file match-flow plugin — `room:*` lifecycle hooks skeleton (peer-joined/left, host-reconnecting,
 * network-warning). Coarse UX/roster only — never gameplay (that rides the Wire).
 */

/**
 * Build the `room:*` hook map. Empty in the skeleton; the lifecycle handlers (peer roster + pause +
 * network-warning UX) are wired in the build wave.
 *
 * @returns The `room:*` hook map (empty in the skeleton).
 * @example
 * ```ts
 * createPlugin("matchFlow", { hooks: createMatchFlowHandlers });
 * ```
 */
export function createMatchFlowHandlers() {
  return {};
}
