/**
 * @file Component prop contracts — the single interface surface every `src/components/*` building
 * block implements and the islands consume. Owning these here keeps the presentational components and
 * the stateful islands in lockstep (the islands map slice data → these props; components render them).
 *
 * All components are pure presentational Preact functions (`data-*` attributes only, `@scope`-d CSS,
 * no class selectors). Player colours arrive as hex strings (chosen at join); answer-slot colours are
 * the fixed per-slot hexes from `TRIVIA.answerSlots`.
 */
import type { QrMatrix } from "@moku-labs/room";
import type { ComponentChildren } from "preact";
import type { Lang, PlayerProfile, Tier } from "../lib/types";

/** A category shown in a picker (id + display name + emoji). */
export type CategoryMeta = { id: string; name: string; emoji: string };

/** A chosen profile emitted by the join wizard. */
export type JoinProfile = { name: string; avatar: string; color: string };

/** PlayerTile (TV lobby grid, §G). A filled player tile, or the empty "Waiting…" slot. */
export type PlayerTileProps = {
  /** The joined player; omit (with `empty`) for the waiting slot. */
  player?: PlayerProfile;
  /** Join order, for the staggered pop-in delay. */
  index?: number;
  /** Render the empty dashed "Waiting…" slot (F6). */
  empty?: boolean;
};

/** QrBlock (TV lobby) — the breathing join-QR card. */
export type QrBlockProps = {
  /** The encoded QR matrix, or `null` before it is generated (shows a pulsing placeholder). */
  matrix: QrMatrix | null;
  /** The scan-hint line below the code. */
  hint?: string;
};

/** RoomCodeBadge (TV lobby) — the large lemon room code. */
export type RoomCodeBadgeProps = { code: string };

/** CategoryCard (TV category pick, §G) — one card in the 3×2 grid. */
export type CategoryCardProps = {
  /** The category to display. */
  category: CategoryMeta;
  /** Reveal state after a pick: chosen glows, dimmed fades to 28%. */
  state?: "idle" | "chosen" | "dimmed";
  /** The active player's signature colour, for the chosen glow. */
  color?: string | undefined;
};

/** AnswerTile (TV question/reveal grid, §G) — letter + shape + text, colour fixed per slot. */
export type AnswerTileProps = {
  /** Slot index 0–3 (A/B/C/D). */
  slotIndex: number;
  /** The slot letter (A–D). */
  letter: string;
  /** The slot shape glyph (▲◆●■). */
  shape: string;
  /** The slot colour hex. */
  hex: string;
  /** The answer text. */
  text: string;
  /** Reveal resolution state (in-place; no layout shift). */
  state?: "idle" | "correct" | "dim" | "wrong";
  /** Optional corner tag ("✓ CORRECT" / "✗ Alex"). */
  tag?: string | undefined;
};

/** TimerRing (TV question, §G) — circular countdown; drains mint→coral, pulses at the low state. */
export type TimerRingProps = { remainingMs: number; totalMs: number };

/** TurnChip (TV question/reveal meta bar, §G) — the active player or the outcome chip. */
export type TurnChipProps = {
  avatar: string;
  name: string;
  /** The player's signature colour. */
  color: string;
  /** The chip label (e.g. "answering" / "Correct! +200"). */
  label: string;
  /** Visual tone — neutral (question), correct/wrong (reveal). */
  tone?: "neutral" | "correct" | "wrong";
};

/** ScoreChip (TV reveal roll-up, F2) — name · total · delta in the player's colour. */
export type ScoreChipProps = { name: string; color: string; total: number; delta: number };

/** ScoreboardTile (TV interstitial, §G) — rank · avatar · name · proportional bar · score. */
export type ScoreboardTileProps = {
  rank: number;
  player: PlayerProfile;
  total: number;
  /** Points earned this round — drives the count-up head start and the "+N" round-gain badge. */
  delta: number;
  /** The leader's total (for the proportional bar width). */
  maxTotal: number;
  /** The name of the player just overtaken, for the "▲ overtook …" badge (F4). */
  movedUpOver?: string | undefined;
};

/** PodiumBlock (TV final, §G) — a gold/silver/bronze stepped block with player + score above. */
export type PodiumBlockProps = {
  /** 1 = gold (centre), 2 = silver (left), 3 = bronze (right). */
  place: 1 | 2 | 3;
  player: PlayerProfile;
  score: number;
};

/** LanguageCard (TV language pick, §G) — flag · name · voters · leading highlight. */
export type LanguageCardProps = {
  lang: Lang;
  label: string;
  sublabel?: string;
  /** Which CSS/SVG flag to render. */
  flag: "us" | "ru";
  /** Avatar emoji of the peers voting for this language (F13). */
  voters: string[];
  /** Whether this card currently leads the tally. */
  leading?: boolean;
};

/**
 * MuteButton (TV top bar, §G) — one audio-channel toggle pill (Music or SFX). `on` is the channel-ENABLED
 * state (so `!on` = muted, which tints the pill); `icon`/`label` name the channel.
 */
export type MuteButtonProps = {
  /** Whether this channel is currently audible (drives the icon/label + muted tint). */
  on: boolean;
  /** The channel label, e.g. `"Music"` / `"SFX"`. */
  label: string;
  /** The glyph shown when the channel is on (a matching muted glyph is shown when off). */
  icon: string;
  /** Called when the pill is tapped. */
  onToggle: () => void;
};

/** CodeEntry (`/code` no-code phone landing) — a join-by-code box that emits the typed room code. */
export type CodeEntryProps = {
  /** Emitted with the normalized (uppercase, alphanumeric) code when the player submits. */
  onJoin: (code: string) => void;
};

/** Confetti (TV podium, F9) — N falling pieces in the clay accents (rendered only when active). */
export type ConfettiProps = { pieces?: number };

/** RoundIntro (TV overlay C1) — "ROUND n of 12" + the active player chip. */
export type RoundIntroProps = {
  round: number;
  total: number;
  avatar?: string | undefined;
  name?: string | undefined;
  color?: string | undefined;
};

/** PauseOverlay (TV overlay C2) — the paused takeover. */
export type PauseOverlayProps = { name?: string | undefined };

/** DisconnectBanner (TV popup D1) — a dropped player + reconnect countdown. */
export type DisconnectBannerProps = {
  avatar: string;
  name: string;
  color: string;
  secondsLeft: number;
  onDismiss: () => void;
};

/** CategoryExhaustedToast (TV popup D2) — "no fresh questions in …". */
export type CategoryExhaustedToastProps = { category: string; onDismiss: () => void };

/** EndCountdownChip (TV popup D4) — "Returning to lobby in n…". */
export type EndCountdownChipProps = { seconds: number };

/** DifficultyPips (§4) — three circles, filled = lemon (easy 1 · medium 2 · hard 3). */
export type DifficultyPipsProps = { tier: Tier };

/** Flag — a CSS/SVG flag (language cards + the demo image question). */
export type FlagProps = { code: "us" | "ru" | "bd" };

/** AnswerButton (phone answer grid, §G) — oversized colour+shape+letter, no text. */
export type AnswerButtonProps = {
  slotIndex: number;
  letter: string;
  shape: string;
  hex: string;
  /** Post-lock state: locked (this pick) or dim (the others). */
  state?: "idle" | "locked" | "dim";
  onPick?: (() => void) | undefined;
};

/** CategoryButton (phone category list, §G) — full-width icon + name. */
export type CategoryButtonProps = {
  category: CategoryMeta;
  selected?: boolean;
  onPick?: () => void;
  /** Position in the list — staggers the entrance so the categories reveal one after another. */
  revealIndex?: number | undefined;
};

/** ClayButton (§G) — the base interactive button shape, tone-coloured. */
export type ClayButtonProps = {
  /** Fill tone. */
  tone?: "lemon" | "amber" | "coral" | "sky" | "violet" | "ghost";
  disabled?: boolean;
  onClick?: () => void;
  children: ComponentChildren;
};

/** DismissButton (§G) — the small ghost pill on banners/toasts. */
export type DismissButtonProps = { label?: string; onClick: () => void };

/** JoinWizard (phone A9) — the 3-step name→avatar→colour wizard (owns its own step state). */
export type JoinWizardProps = {
  /** Avatar choices. */
  avatars: readonly string[];
  /** Colour choices (name + hex). */
  colors: readonly { name: string; hex: string }[];
  /** Hexes already taken by other players (greyed, unselectable). */
  takenColors: readonly string[];
  /** The room code (shown on the "You're in!" card). */
  roomCode?: string | undefined;
  /** Once true, render the "You're in! ♪" confirmation instead of the wizard. */
  joined?: boolean | undefined;
  /** The joined player's chosen avatar/colour (for the confirmation card). */
  joinedAvatar?: string | undefined;
  joinedColor?: string | undefined;
  /** Emitted once on "Join Game". */
  onJoin: (profile: JoinProfile) => void;
};

/** LeaveModal (phone E1) — confirm leaving the game. */
export type LeaveModalProps = { onStay: () => void; onLeave: () => void };

/** MidJoinModal (phone E2) — "game in progress, join next match". */
export type MidJoinModalProps = { onDismiss: () => void };

/** RevealFlash (phone A13/A14) — full-screen correct/wrong flash. */
export type RevealFlashProps = { correct: boolean; points?: number };

/** The categories list shape passed to grids (re-export for component authors). */
export type { CategoryAvailView } from "../lib/types";
