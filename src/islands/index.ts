/**
 * @file Island registry — the interactive components the SPA hydrates (web Rule R2).
 */
import { activityFeed } from "./activity-feed";
import { attachmentUpload } from "./attachment-upload";
import { boardDnd } from "./board-dnd";
import { cardEditor } from "./card-editor";
import { liveSync } from "./live-sync";

/** All islands registered with the spa plugin's component registry. */
export const islands = [boardDnd, liveSync, activityFeed, cardEditor, attachmentUpload];
