/**
 * @file board island — types + constants shared across the board island's files.
 */
import type { Spa } from "@moku-labs/web/browser";
import type { Attachment, BoardSnapshot } from "../../lib/types";

/** Keepalive ping interval (ms) — keeps idle proxies from dropping the live socket. */
export const KEEPALIVE_MS = 30_000;
/** MIME type used when a dropped/selected file reports none. */
export const FALLBACK_TYPE = "application/octet-stream";
/** dataTransfer key carrying the dragged card id. */
export const DRAG_KEY = "text/plain";

/** Per-instance state for the board island. */
export type BoardState = {
  /** The board id this instance is bound to (from the route). */
  boardId: string;
  /** The current board snapshot (replaced immutably as patches/mutations apply). */
  snapshot: BoardSnapshot;
  /** Session attachments grouped by card id (R2 uploads proven live). */
  attachmentsByCard: Map<string, Attachment[]>;
  /** Body-level overlay root the attachment preview renders into (undefined until mounted). */
  previewRoot: HTMLElement | undefined;
  /** The attachment currently previewed, or undefined when the overlay is closed. */
  preview: Attachment | undefined;
};

/** The board component context (typed per-instance state). */
export type BoardContext = Spa.IslandContext<BoardState>;

/** An empty snapshot used as the initial state before the real one loads. */
export const EMPTY_SNAPSHOT: BoardSnapshot = {
  board: { id: "", title: "", createdAt: 0 },
  columns: [],
  cards: [],
  attachments: []
};
