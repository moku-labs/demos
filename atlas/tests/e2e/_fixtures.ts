/**
 * @file Shared data fixtures for Atlas E2E specs — throwaway boards + issues.
 *
 * Mutating specs MUST NOT create issues on the canonical `board-platform`: that board is the
 * subject of the visual baselines (baseline.spec.ts), and any extra Backlog cards make its
 * fullPage captures non-deterministic. Playwright runs the `chromium` project fully before
 * `chromium-mobile` against ONE shared wrangler-dev DB (reseeded only once), so a mutator that
 * touched `board-platform` would pollute it before the mobile project screenshots the board.
 *
 * Instead, every mutating test creates a throwaway Engineering board here and works on that,
 * keeping `board-platform` pristine for the baselines. A fresh board seeds the same default
 * Backlog / In Progress / In Review / Done columns (see `src/plugins/boards/api.ts`) — and the
 * board island maps a column to its status by TITLE (`statusForColumn`) — so status-move and
 * card-placement assertions behave identically to the seed board. The extra boards land in
 * `dept-eng` off-screen to the right of the boards bar, so they never affect a region capture.
 */
import { expect, type Page } from "@playwright/test";

/**
 * Create a throwaway Engineering board and return its id (keeps the seed boards untouched).
 *
 * @param page - The Playwright page (its request context carries the auth cookie).
 * @param title - The new board's title.
 * @returns The created board's id.
 */
export async function freshBoard(page: Page, title: string): Promise<string> {
  const res = await page.request.post("/api/boards", {
    data: { departmentId: "dept-eng", title }
  });
  expect(res.ok()).toBeTruthy();
  return ((await res.json()) as { id: string }).id;
}

/**
 * Resolve a board's first (Backlog) column id from its snapshot.
 *
 * @param page - The Playwright page.
 * @param boardId - The board to inspect.
 * @returns The id of the board's first column (its Backlog).
 */
export async function backlogColumnId(page: Page, boardId: string): Promise<string> {
  const res = await page.request.get(`/api/boards/${boardId}`);
  const snap = (await res.json()) as { columns: { id: string }[] };
  return snap.columns[0]?.id ?? "";
}

/**
 * Create one issue in a given board column and return its id.
 *
 * @param page - The Playwright page.
 * @param boardId - The owning board.
 * @param columnId - The column to create the issue in.
 * @param title - The issue title.
 * @returns The created issue's id.
 */
export async function freshIssueIn(
  page: Page,
  boardId: string,
  columnId: string,
  title: string
): Promise<string> {
  const res = await page.request.post(`/api/boards/${boardId}/columns/${columnId}/issues`, {
    data: { title }
  });
  expect(res.ok()).toBeTruthy();
  return ((await res.json()) as { id: string }).id;
}

/**
 * Create a throwaway board AND one issue in its first (Backlog) column. Isolates issue/board
 * assertions from the shared platform board, whose Backlog must stay pristine for the baselines.
 *
 * @param page - The Playwright page.
 * @param boardTitle - Title for the throwaway board.
 * @param issueTitle - Title for the seeded issue.
 * @returns The created board id and issue id.
 */
export async function freshBoardWithIssue(
  page: Page,
  boardTitle: string,
  issueTitle: string
): Promise<{ boardId: string; issueId: string }> {
  const boardId = await freshBoard(page, boardTitle);
  const columnId = await backlogColumnId(page, boardId);
  const issueId = await freshIssueIn(page, boardId, columnId, issueTitle);
  return { boardId, issueId };
}
