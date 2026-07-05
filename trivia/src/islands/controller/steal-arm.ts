/**
 * @file controller island — the phone-local steal lead-in anchor (pure, unit-testable).
 *
 * The steal grid's "get ready" beat is timed on THIS phone's own clock, not on the host's `armed` sync
 * frame: that single best-effort frame can be lost on a real network, and a lone stealer produces no later
 * steal frame to reveal the gap — so the old gate (`arming = !s.steal.armed`) stranded the grid on "Get
 * ready…" until a reload (the steal-lock bug). Nor does the phone compare the host's absolute `armedTs`
 * against its own clock (the fast-tap skew bug). Instead the controller lifecycle anchors an unlock time
 * once, the moment it first sees the steal open, and {@link PhoneAnswer} keys `arming` on it.
 */
import { TRIVIA } from "../../config";

/**
 * Compute this phone's steal-grid unlock time — the phone-clock ms at which its local "get ready" lead-in
 * ends. Anchored ONCE when the steal first opens (`now + leadMs`), kept unchanged while it stays open, and
 * cleared (`null`) when it closes so the next steal re-anchors from scratch.
 *
 * Because the phone only starts counting once it has RECEIVED the open, its countdown always ends a hair
 * AFTER the host's (which started at the earlier moment the host opened the steal) — so the grid can never
 * unlock before the host's accept window opens, and no tap it can send is dropped.
 *
 * @param previous - The current anchor from island state; `null`/`undefined` = not yet anchored this steal.
 * @param inSteal - Whether an open steal is live for this phone right now (`steal.active` + steal-mode question).
 * @param now - This phone's clock time (ms) at this observation (`Date.now()`).
 * @param leadMs - The steal lead-in duration; defaults to `TRIVIA.timers.stealLeadMs`.
 * @returns The phone-clock unlock time (ms) while a steal is open, else `null`.
 * @example
 * ```ts
 * const stealArmAt = nextStealArmAt(ctx.state.stealArmAt, inSteal, Date.now());
 * ```
 */
export function nextStealArmAt(
  previous: number | null | undefined,
  inSteal: boolean,
  now: number,
  leadMs: number = TRIVIA.timers.stealLeadMs
): number | null {
  // eslint-disable-next-line unicorn/no-null -- null clears the anchor when no steal is open (re-anchors next)
  if (!inSteal) return null;
  return previous ?? now + leadMs;
}
