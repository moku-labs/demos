/**
 * @file The web↔room bridge — a module singleton islands import (idiom I5, like tracker/lib/realtime.ts).
 * Owns the room apps; adapts them to a small render/intent surface. Created only in the browser.
 */
import type { RoomDescriptor } from "@moku-labs/room";
import type { IntentName, IntentPayload, TriviaState } from "../types";
import type { RoomLifecycle } from "./types";

/**
 * Create + start the stage app, open a room, and return its descriptor (code + joinUrl).
 *
 * @throws {Error} Always — skeleton stub, implemented in the build wave.
 * @example
 * ```ts
 * const { code, joinUrl } = await startStage();
 * ```
 */
export async function startStage(): Promise<RoomDescriptor> {
  throw new Error("not implemented");
}

/**
 * Create + start the controller app and join the room.
 *
 * @param _code - The room code from the deep-link.
 * @throws {Error} Always — skeleton stub, implemented in the build wave.
 * @example
 * ```ts
 * await startController("4F2KAB12");
 * ```
 */
export async function startController(_code: string): Promise<void> {
  throw new Error("not implemented");
}

/**
 * Read the merged synced-slice state for render.
 *
 * @throws {Error} Always — skeleton stub, implemented in the build wave.
 * @example
 * ```ts
 * const s = snapshot();
 * ```
 */
export function snapshot(): TriviaState {
  throw new Error("not implemented");
}

/**
 * Subscribe to any slice change; returns an unsubscribe.
 *
 * @param _fn - Called with the merged state on every change.
 * @throws {Error} Always — skeleton stub, implemented in the build wave.
 * @example
 * ```ts
 * const off = subscribe(render);
 * ```
 */
export function subscribe(_fn: (state: TriviaState) => void): () => void {
  throw new Error("not implemented");
}

/**
 * Send a controller→host intent over the Wire.
 *
 * @param _name - The intent name.
 * @param _payload - The typed payload.
 * @throws {Error} Always — skeleton stub, implemented in the build wave.
 * @example
 * ```ts
 * intent("answer-lock", { slot: 1 });
 * ```
 */
export function intent<K extends IntentName>(_name: K, _payload: IntentPayload[K]): void {
  throw new Error("not implemented");
}

/**
 * Subscribe to coarse room lifecycle (room:* events) for UX; returns an unsubscribe.
 *
 * @param _fn - Called on each lifecycle event.
 * @throws {Error} Always — skeleton stub, implemented in the build wave.
 * @example
 * ```ts
 * const off = onLifecycle(e => showBanner(e));
 * ```
 */
export function onLifecycle(_fn: (event: RoomLifecycle) => void): () => void {
  throw new Error("not implemented");
}

/**
 * The stage QR matrix for the lobby (async).
 *
 * @throws {Error} Always — skeleton stub, implemented in the build wave.
 * @example
 * ```ts
 * const matrix = await qr();
 * ```
 */
export async function qr(): Promise<unknown> {
  throw new Error("not implemented");
}
