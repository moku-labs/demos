import type { JSX } from "preact";
import { useState } from "preact/hooks";
import type { JoinProfile, JoinWizardProps } from "./types";

/** The three wizard steps, in order. */
const STEPS = [1, 2, 3] as const;

/**
 * The 3-step phone join wizard: name → avatar → colour (design §6 A9, interaction §4 "Join wizard").
 *
 * Owns its own `useState` for the current step and the draft profile (name / avatar / colour). A 3-dot
 * progress indicator sits on top (the active dot is an elongated lemon pill, inactive dots are dim).
 * Step 1 is a large centred name input; step 2 a grid of `avatars`; step 3 a row of colour swatches
 * where any hex in `takenColors` renders at 30% opacity and is not selectable. Each step has a lemon
 * "Next ▸" (which on step 3 reads "Join Game ▸" and emits `onJoin`) plus a "← Back" ghost link from
 * step 2 on. "Next" is blocked from step 1 while the name is empty; avatar/colour default to the first
 * available option. Once `joined` is true the dots hide and the "You're in! ♪" card renders instead.
 *
 * @param props - The wizard props.
 * @param props.avatars - The avatar emoji choices (step 2 grid).
 * @param props.colors - The colour choices as `{ name, hex }` (step 3 swatches).
 * @param props.takenColors - Hexes already claimed by other players (greyed, unselectable).
 * @param props.roomCode - The room code shown on the "You're in!" confirmation card.
 * @param props.joined - When true, render the confirmation card instead of the wizard.
 * @param props.joinedAvatar - The chosen avatar to show on the confirmation card.
 * @param props.joinedColor - The chosen colour (hex) inking the "You're in!" line.
 * @param props.onJoin - Emitted once on "Join Game" with the chosen `{ name, avatar, color }`.
 * @returns The join wizard, or the "You're in!" confirmation card once joined.
 * @example
 * ```tsx
 * <JoinWizard
 *   avatars={TRIVIA.avatars}
 *   colors={TRIVIA.playerColors}
 *   takenColors={["#F59E0B"]}
 *   roomCode="4F2K"
 *   onJoin={(p) => start(p)}
 * />
 * ```
 */
export function JoinWizard({
  avatars,
  colors,
  takenColors,
  roomCode,
  joined,
  joinedAvatar,
  joinedColor,
  onJoin
}: JoinWizardProps): JSX.Element {
  const firstAvatar = avatars[0] ?? "🦊";
  const firstFree = colors.find(c => !takenColors.includes(c.hex)) ?? colors[0];

  const [step, setStep] = useState<number>(1);
  const [name, setName] = useState<string>("");
  const [avatar, setAvatar] = useState<string>(firstAvatar);
  const [color, setColor] = useState<string>(firstFree?.hex ?? "#F59E0B");

  const nameReady = name.trim().length > 0;
  const isLast = step === 3;

  const advance = (): void => {
    if (step === 1 && !nameReady) return;
    if (isLast) {
      onJoin({ name: name.trim(), avatar, color } satisfies JoinProfile);
      return;
    }
    setStep(step + 1);
  };

  // ── Confirmation card — the wizard is done, waiting for the host ──
  if (joined) {
    return (
      <div data-component="join-wizard" data-joined="true">
        <div data-confirm style={{ "--joined": joinedColor ?? color }}>
          <span data-confirm-avatar aria-hidden="true">
            {joinedAvatar ?? avatar}
          </span>
          <strong data-confirm-title>You're in! ♪</strong>
          <span data-confirm-room>Room {roomCode ?? "—"} · Waiting for host…</span>
        </div>
      </div>
    );
  }

  return (
    <div data-component="join-wizard">
      <div data-dots role="presentation">
        {STEPS.map(s => (
          <span key={s} data-dot data-active={s === step ? "true" : undefined} />
        ))}
      </div>

      <div data-stage>
        {step === 1 && (
          <div data-step="name">
            <strong data-heading>Enter your name</strong>
            <input
              data-name-input
              type="text"
              value={name}
              maxLength={16}
              placeholder="Your name"
              aria-label="Your name"
              autoComplete="off"
              onInput={e => setName((e.currentTarget as HTMLInputElement).value)}
              onKeyDown={e => {
                if (e.key === "Enter") advance();
              }}
            />
          </div>
        )}

        {step === 2 && (
          <div data-step="avatar">
            <strong data-heading>Pick your avatar</strong>
            <div data-avatar-grid>
              {avatars.map(a => (
                <button
                  key={a}
                  type="button"
                  data-avatar-cell
                  data-selected={a === avatar ? "true" : undefined}
                  aria-label={`Avatar ${a}`}
                  aria-pressed={a === avatar}
                  onClick={() => setAvatar(a)}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div data-step="color">
            <strong data-heading>Pick your color</strong>
            <div data-color-row>
              {colors.map(c => {
                const taken = takenColors.includes(c.hex);
                return (
                  <button
                    key={c.hex}
                    type="button"
                    data-swatch
                    data-selected={c.hex === color ? "true" : undefined}
                    data-taken={taken ? "true" : undefined}
                    disabled={taken}
                    style={{ "--swatch": c.hex }}
                    aria-label={`Colour ${c.name}${taken ? " (taken)" : ""}`}
                    aria-pressed={c.hex === color}
                    onClick={() => {
                      if (!taken) setColor(c.hex);
                    }}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div data-nav>
        {step > 1 && (
          <button type="button" data-back onClick={() => setStep(step - 1)}>
            ← Back
          </button>
        )}
        <button type="button" data-next disabled={step === 1 && !nameReady} onClick={advance}>
          {isLast ? "Join Game ▸" : "Next ▸"}
        </button>
      </div>
    </div>
  );
}
