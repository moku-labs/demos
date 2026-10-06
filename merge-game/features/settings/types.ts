/**
 * @file The public types of the settings: its tabs, its buses and what its intents carry.
 */

/** The three tabs of the popup. */
export type Tab = "audio" | "language" | "profile";

/** The two buses the player sets. */
export type Bus = "music" | "sfx";

/** The intent that changes a bus, and what it carries. */
export type VolumeInput = { bus: string; delta: number };

/** The intent that switches the language. */
export type LocaleInput = { locale: string };
