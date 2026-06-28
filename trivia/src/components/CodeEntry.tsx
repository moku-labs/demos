/**
 * @file CodeEntry — the `/code` join-by-code box (the no-code phone landing, design §6 A9 sibling). A
 * single uppercase code field + a Join button; submitting calls `onJoin(code)` and the island navigates
 * to `/code/{code}`. The field force-uppercases and strips to A–Z/0–9 as you type, so "abc 123" and
 * "ABC123" reach the same room — players never trip over case or stray spaces when typing a code read
 * off the TV.
 */
import type { JSX } from "preact";
import { useState } from "preact/hooks";
import { TRIVIA } from "../config";
import { ClayButton } from "./ClayButton";
import type { CodeEntryProps } from "./types";

/**
 * Normalize raw input to the room-code alphabet: upper-case, strip everything but A–Z/0–9, and cap at
 * {@link TRIVIA.codeLength}. Keeps the displayed value and the submitted code identical and case-free.
 *
 * @param raw - The raw input value.
 * @returns The normalized (uppercase, alphanumeric, length-capped) code.
 * @example
 * ```ts
 * normalizeCode("ab2-9 x"); // "AB29X"
 * ```
 */
function normalizeCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, TRIVIA.codeLength);
}

/**
 * The join-by-code entry box shown at `/code` (no code in the URL).
 *
 * Owns its own `useState` for the typed code. The input normalizes every keystroke (uppercase +
 * alphanumeric, capped at the room-code length), so the box only ever holds a valid-shaped code. The
 * Join button (and the Enter key) emit `onJoin(code)`; both stay inert until at least one character is
 * entered. The parent island turns `onJoin` into a navigation to `/code/{code}`.
 *
 * @param props - The code-entry props.
 * @param props.onJoin - Emitted with the normalized code when the player submits.
 * @returns The code-entry box.
 * @example
 * ```tsx
 * <CodeEntry onJoin={(code) => hardNavigate(`/code/${code}`)} />
 * ```
 */
export function CodeEntry({ onJoin }: CodeEntryProps): JSX.Element {
  const [code, setCode] = useState<string>("");
  const ready = code.length > 0;

  const submit = (): void => {
    if (ready) onJoin(code);
  };

  return (
    <div data-component="code-entry">
      <div data-card>
        <span data-kicker>Trivia</span>
        <h1 data-heading>Join the game</h1>
        <p data-sub>Enter the code shown on the TV</p>
        <input
          data-code-input
          type="text"
          inputMode="text"
          autoCapitalize="characters"
          autoCorrect="off"
          spellcheck={false}
          autoComplete="off"
          value={code}
          maxLength={TRIVIA.codeLength}
          placeholder="CODE"
          aria-label="Room code"
          onInput={e => setCode(normalizeCode((e.currentTarget as HTMLInputElement).value))}
          onKeyDown={e => {
            if (e.key === "Enter") submit();
          }}
        />
        <ClayButton tone="lemon" disabled={!ready} onClick={submit}>
          Join ▸
        </ClayButton>
      </div>
    </div>
  );
}
