/**
 * @file Island registry — the interactive components the SPA hydrates (web Rule R2). Each entry is a
 * `createIsland(...)` bound to a `data-island="…"` host in the SSR markup; the spa plugin mounts the
 * matching island on every host it finds and re-runs `onNavEnd` for the persistent ones. Registered
 * here → `pluginConfigs.spa.islands` in {@link file://../spa.tsx}.
 *
 * Grouped by region:
 * - **Working surface** — `board` (kanban + list, drag, realtime) · `issue` (the slide-over editor).
 * - **Chrome / nav** — `departments` · `boardsBar` · `boardHeader` · `themeToggle` · `userMenu` ·
 *   `overflowSheet` (the mobile masthead "⋯" overflow bottom sheet).
 * - **Overlay singletons** — `contextMenu` · `chooser` · `modal` · `toast` · `customizePanel` ·
 *   `filterPanel` · `activityPanel` (the transient-overlay bus consumers, persistent across navigation).
 * - **Auth** — `auth` (the sign-in / sign-up form).
 */
import { activityPanel } from "./activity-panel";
import { auth } from "./auth";
import { board } from "./board";
import { boardHeader } from "./board-header";
import { boardsBar } from "./boards-bar";
import { chooser } from "./chooser";
import { contextMenu } from "./context-menu";
import { customizePanel } from "./customize-panel";
import { departments } from "./departments";
import { filterPanel } from "./filter-panel";
import { issue } from "./issue";
import { modal } from "./modal";
import { overflowSheet } from "./overflow-sheet";
import { themeToggle } from "./theme-toggle";
import { toast } from "./toast";
import { userMenu } from "./user-menu";

/** Every island registered with the spa plugin's component registry (wired in `spa.tsx`). */
export const islands = [
  // Working surface
  board,
  issue,
  // Chrome / nav
  departments,
  boardsBar,
  boardHeader,
  themeToggle,
  userMenu,
  overflowSheet,
  // Overlay singletons (the lib/menu bus consumers + the persistent panels)
  contextMenu,
  chooser,
  modal,
  toast,
  customizePanel,
  filterPanel,
  activityPanel,
  // Auth
  auth
];
