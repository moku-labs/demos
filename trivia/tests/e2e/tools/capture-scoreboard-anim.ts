#!/usr/bin/env bun
/**
 * @file Human-review capture tool for the scoreboard-animation case matrix (spec/scoreboard-animation.md
 * §6) — NOT a test. For each case in `tests/e2e/harness/scoreboard-matrix.ts`, with motion ON at
 * 1280×800, it records a video of the full choreography and captures three PNG frames by WAITING ON the
 * `data-choreography` DOM attribute (never wall-clock alone):
 *
 * - `frame-1-delta.png`      — mid-hold (after ~400ms of the "delta" phase — count-up visibly mid-flight)
 * - `frame-2-mid-reorder.png` — ~250ms into the "reorder" phase (slides mid-flight)
 * - `frame-3-settled.png`     — once `data-choreography="settled"`
 *
 * Output per case: `.planning/review/scoreboard-anim/<case-id>/{frame-1-delta,frame-2-mid-reorder,
 * frame-3-settled}.png` + `clip.webm` (Playwright's video artifact, renamed into the case dir) + `clip.gif`
 * (transcoded via ffmpeg when it's on PATH — silently skipped otherwise, noted in the summary). Also
 * writes `.planning/review/scoreboard-anim/index.html`, a static page listing every case (title +
 * expected behaviour, copied from the spec table) with the three frames inline + a `<video>` for the clip.
 *
 * Self-contained: boots its OWN `bun run dev` server (TRIVIA_E2E=1, a dedicated port so it never collides
 * with a Playwright run or another session's dev server) unless `CAPTURE_BASE_URL` is set, in which case
 * it assumes that server is already running the harness build (TRIVIA_E2E=1) and skips managing one.
 *
 * Usage: `bun run tests/e2e/tools/capture-scoreboard-anim.ts`
 */
import { spawn } from "node:child_process";
import { mkdir, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { SCOREBOARD_MATRIX } from "../harness/scoreboard-matrix";

/** Dedicated port for the tool's self-managed dev server — avoids colliding with a Playwright run. */
const CAPTURE_PORT = 8801;

/** Where the human-review pack lands (spec §6). */
const OUT_DIR = path.resolve(import.meta.dir, "../../../.planning/review/scoreboard-anim");

/** How long to wait for the dev server to boot + serve the harness build. */
const SERVER_BOOT_TIMEOUT_MS = 90_000;

/** Mirrors `useScoreboardChoreography`'s `SCOREBOARD_DELTA_HOLD_MS` (src/components/use-scoreboard-choreography.ts). */
const DELTA_HOLD_MS = 1450;

/** How deep into the "delta" hold to snap frame 1 — the count-up must be visibly mid-flight. */
const DELTA_FRAME_OFFSET_MS = 400;

/** How deep into the "reorder" beat to snap frame 2 — the FLIP slide must be visibly mid-flight. */
const REORDER_FRAME_OFFSET_MS = 250;

/**
 * Resolve an executable name to its absolute path via `Bun.which()` — spawning a bare command name trusts
 * whatever `PATH` happens to contain at runtime; resolving first pins the exact binary being invoked.
 *
 * @param name - The executable name (e.g. `"bun"`, `"ffmpeg"`).
 * @returns The absolute path, or `null` if the executable isn't found on `PATH`.
 * @example
 * ```ts
 * const bunPath = resolveExecutable("bun"); // "/opt/homebrew/bin/bun" (or null)
 * ```
 */
function resolveExecutable(name: string): string | null {
  return Bun.which(name);
}

/**
 * Read the scoreboard root's current `data-choreography` phase (or `null` if not yet mounted).
 *
 * @param page - The Playwright page.
 * @returns The current choreography phase string, or `null`.
 */
async function choreographyPhase(page: import("playwright").Page): Promise<string | null> {
  // eslint-disable-next-line unicorn/prefer-dom-node-dataset -- Playwright Locator, not a DOM node
  return page.locator("[data-component='stage-scoreboard']").getAttribute("data-choreography");
}

/**
 * Poll until `data-choreography` reaches the target phase (or a later one in the sequence), bounded by a
 * timeout. Used instead of a bare `waitForTimeout` so the capture is robust to render/CI jitter.
 *
 * @param page - The Playwright page.
 * @param target - The phase to wait for (`"reorder"` or `"settled"`).
 * @param timeoutMs - Max time to wait.
 */
async function waitForChoreography(
  page: import("playwright").Page,
  target: "delta" | "reorder" | "settled",
  timeoutMs: number
): Promise<void> {
  const order = ["delta", "reorder", "settled"];
  const targetIndex = order.indexOf(target);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const phase = await choreographyPhase(page);
    if (phase && order.indexOf(phase) >= targetIndex) return;
    await page.waitForTimeout(50);
  }
  throw new Error(`data-choreography never reached "${target}" within ${timeoutMs}ms`);
}

/**
 * Start `bun run dev` on the dedicated capture port with the harness build enabled, and block until the
 * server serves it (a 200 response containing the harness marker script tag — the harness build serves
 * `spa-e2e.ts`, which sets `data-e2e-harness` at runtime, so a 200 on `/?e2ephase=scoreboard` is enough
 * signal at the HTTP layer; the real freshness check happens once Playwright loads the page).
 *
 * @returns The spawned child process (caller is responsible for killing it).
 */
async function bootServer(): Promise<ReturnType<typeof spawn>> {
  const bunPath = resolveExecutable("bun");
  if (!bunPath) {
    throw new Error(
      "[capture-scoreboard-anim] `bun` not found on PATH — cannot boot the dev server."
    );
  }

  // `bun run dev` spawns wrangler, which spawns workerd — a subprocess TREE. `detached: true` puts the
  // whole tree in its own process group so teardown can kill the group (`-pid`), not just the immediate
  // child (killing only the child otherwise leaks wrangler/workerd on every run).
  const child = spawn(bunPath, ["run", "dev", "--port", String(CAPTURE_PORT)], {
    cwd: path.resolve(import.meta.dir, "../../.."),
    env: { ...process.env, TRIVIA_E2E: "1" },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true
  });

  let serverLog = "";
  child.stdout?.on("data", chunk => {
    serverLog += String(chunk);
  });
  child.stderr?.on("data", chunk => {
    serverLog += String(chunk);
  });

  const base = `http://localhost:${CAPTURE_PORT}`;
  const deadline = Date.now() + SERVER_BOOT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${base}/?e2ephase=scoreboard`);
      if (response.ok) return child;
    } catch {
      // Not up yet — keep polling.
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  killServerTree(child);
  throw new Error(
    `[capture-scoreboard-anim] dev server on ${base} never came up within ` +
      `${SERVER_BOOT_TIMEOUT_MS / 1000}s.\nServer log tail:\n${serverLog.slice(-2000)}`
  );
}

/**
 * Kill a `bootServer()` child AND its whole process group (`bun` → wrangler → workerd) — `detached:
 * true` at spawn puts the tree in its own group, so killing the negated pid signals every process in it.
 * A no-op when `server` is `undefined` (the `CAPTURE_BASE_URL` external-server path never boots one).
 *
 * @param server - The spawned server process (from `bootServer()`), or `undefined`.
 */
function killServerTree(server: ReturnType<typeof spawn> | undefined): void {
  if (!server?.pid) return;
  try {
    process.kill(-server.pid, "SIGKILL");
  } catch {
    // Already exited, or the group is otherwise gone — nothing more to do.
  }
}

/**
 * Capture one matrix case: motion-ON video + the three phase-gated frames.
 *
 * @param browser - The launched Chromium browser.
 * @param baseUrl - The base URL of the harness server.
 * @param caseId - The case's directory-safe id (spec §4 case id, sanitised — `S1+S3` → `s1-s3`).
 * @param phase - The harness `?e2ephase=` value to navigate to.
 * @returns The absolute path to the case's output directory.
 */
async function captureCase(
  browser: import("playwright").Browser,
  baseUrl: string,
  caseId: string,
  phase: string
): Promise<string> {
  const caseDir = path.join(OUT_DIR, caseId);
  await mkdir(caseDir, { recursive: true });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    colorScheme: "dark",
    recordVideo: { dir: caseDir, size: { width: 1280, height: 800 } }
  });
  const page = await context.newPage();

  try {
    await page.goto(`${baseUrl}/?e2ephase=${phase}`);
    await page.waitForSelector("[data-stage][data-phase='scoreboard']", { timeout: 20_000 });
    await page.evaluate(() => document.fonts.ready);

    // Frame 1 — mid-"delta" hold: the count-up + gain badges are visibly mid-flight.
    await page.waitForTimeout(DELTA_FRAME_OFFSET_MS);
    await page.screenshot({ path: path.join(caseDir, "frame-1-delta.png") });

    // Frame 2 — mid-"reorder": the FLIP slide is visibly mid-flight (the board is moving, not yet rest).
    await waitForChoreography(page, "reorder", DELTA_HOLD_MS + 2000);
    await page.waitForTimeout(REORDER_FRAME_OFFSET_MS);
    await page.screenshot({ path: path.join(caseDir, "frame-2-mid-reorder.png") });

    // Frame 3 — settled: the choreography has finished; the board is at rest.
    await waitForChoreography(page, "settled", 4000);
    await page.screenshot({ path: path.join(caseDir, "frame-3-settled.png") });
  } finally {
    await context.close(); // flushes the recorded video to disk
  }

  // Playwright names the video after an internal id — find and rename it to `clip.webm`.
  const video = await page
    .video()
    ?.path()
    .catch(() => undefined);
  if (video) {
    await rename(video, path.join(caseDir, "clip.webm")).catch(() => undefined);
  }

  return caseDir;
}

/**
 * Transcode `clip.webm` → `clip.gif` via ffmpeg (≤12fps, 640px wide) when ffmpeg is on PATH.
 *
 * @param caseDir - The case's output directory (must already contain `clip.webm`).
 * @returns Whether the GIF was produced.
 */
async function transcodeToGif(caseDir: string): Promise<boolean> {
  const ffmpegPath = resolveExecutable("ffmpeg");
  if (!ffmpegPath) return false; // ffmpeg not on PATH — noted in the run summary, never fatal

  const webm = path.join(caseDir, "clip.webm");
  const gif = path.join(caseDir, "clip.gif");
  return new Promise(resolve => {
    const ffmpeg = spawn(ffmpegPath, [
      "-y",
      "-i",
      webm,
      "-vf",
      "fps=12,scale=640:-1:flags=lanczos",
      gif
    ]);
    ffmpeg.on("error", () => resolve(false));
    ffmpeg.on("exit", code => resolve(code === 0));
  });
}

/** Escape a string for safe inline use in generated HTML. */
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Build the static review index page listing every case (title + expected behaviour + the three frames
 * + a `<video>` for the clip).
 *
 * @param results - Per-case capture results (id, title, expected text, whether a GIF was produced).
 * @returns The full HTML document text.
 */
function buildIndexHtml(
  results: ReadonlyArray<{
    id: string;
    dirName: string;
    title: string;
    expected: string;
    hasGif: boolean;
  }>
): string {
  const cards = results
    .map(r => {
      const gifRow = r.hasGif
        ? `<img src="${r.dirName}/clip.gif" alt="${escapeHtml(r.title)} animation" style="max-width:100%;border:1px solid #444;" />`
        : `<p><em>ffmpeg unavailable — no GIF; see clip.webm below.</em></p>`;
      return `
    <section style="margin-bottom:3rem;padding-bottom:2rem;border-bottom:1px solid #333;">
      <h2>${escapeHtml(r.id)} — ${escapeHtml(r.title)}</h2>
      <p><strong>Expected motion:</strong> ${escapeHtml(r.expected)}</p>
      <div style="display:flex;gap:1rem;flex-wrap:wrap;margin-bottom:1rem;">
        <figure style="margin:0;">
          <img src="${r.dirName}/frame-1-delta.png" alt="${escapeHtml(r.title)} — delta hold" width="420" />
          <figcaption>frame 1 — delta hold (mid count-up)</figcaption>
        </figure>
        <figure style="margin:0;">
          <img src="${r.dirName}/frame-2-mid-reorder.png" alt="${escapeHtml(r.title)} — mid reorder" width="420" />
          <figcaption>frame 2 — mid reorder (FLIP sliding)</figcaption>
        </figure>
        <figure style="margin:0;">
          <img src="${r.dirName}/frame-3-settled.png" alt="${escapeHtml(r.title)} — settled" width="420" />
          <figcaption>frame 3 — settled</figcaption>
        </figure>
      </div>
      ${gifRow}
      <video src="${r.dirName}/clip.webm" controls width="640" style="display:block;margin-top:0.5rem;"></video>
    </section>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Scoreboard animation — review pack (spec/scoreboard-animation.md §6)</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #111; color: #eee; padding: 2rem; max-width: 1100px; margin: 0 auto; }
    h1 { font-size: 1.5rem; }
    h2 { font-size: 1.15rem; margin-bottom: 0.25rem; }
    figcaption { font-size: 0.8rem; color: #999; }
    a { color: #8b5cf6; }
  </style>
</head>
<body>
  <h1>Scoreboard animation — human review pack</h1>
  <p>Generated by <code>tests/e2e/tools/capture-scoreboard-anim.ts</code> from
     <code>spec/scoreboard-animation.md</code> §4's case matrix. Each case below shows the three
     phase-gated frames (delta hold → mid-reorder → settled) and the full clip.</p>
${cards}
</body>
</html>
`;
}

/**
 * Sanitise a spec case id into a filesystem-safe directory name (e.g. `S1+S3` → `s1-s3`).
 *
 * @param id - The spec §4 case id.
 * @returns A lowercase, hyphenated directory name.
 */
function dirNameFor(id: string): string {
  return id
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/(^-|-$)/g, "");
}

/** Entry point — capture every matrix case, transcode GIFs, and write the review index. */
async function main(): Promise<void> {
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });

  const externalBaseUrl = process.env.CAPTURE_BASE_URL;
  const server = externalBaseUrl ? undefined : await bootServer();
  const baseUrl = externalBaseUrl ?? `http://localhost:${CAPTURE_PORT}`;

  console.log(
    `[capture-scoreboard-anim] serving from ${baseUrl}${server ? " (self-managed)" : " (external)"}`
  );

  const browser = await chromium.launch();
  const results: Array<{
    id: string;
    dirName: string;
    title: string;
    expected: string;
    hasGif: boolean;
  }> = [];

  try {
    for (const matrixCase of SCOREBOARD_MATRIX) {
      const dirName = dirNameFor(matrixCase.id);
      console.log(`[capture-scoreboard-anim] capturing ${matrixCase.id} (${matrixCase.phase})…`);
      const caseDir = await captureCase(browser, baseUrl, dirName, matrixCase.phase);
      const hasGif = await transcodeToGif(caseDir);
      results.push({
        id: matrixCase.id,
        dirName,
        title: matrixCase.title,
        expected: matrixCase.expected,
        hasGif
      });
      console.log(
        `[capture-scoreboard-anim] ${matrixCase.id} → ${caseDir} (gif: ${hasGif ? "yes" : "no"})`
      );
    }
  } finally {
    await browser.close();
    killServerTree(server);
  }

  const indexPath = path.join(OUT_DIR, "index.html");
  await Bun.write(indexPath, buildIndexHtml(results));
  console.log(`[capture-scoreboard-anim] wrote ${indexPath}`);

  // Sanity check: every case produced non-trivial, distinguishable frame files.
  for (const result of results) {
    const dir = path.join(OUT_DIR, result.dirName);
    const sizes = await Promise.all(
      ["frame-1-delta.png", "frame-2-mid-reorder.png", "frame-3-settled.png"].map(async name => {
        const buf = await readFile(path.join(dir, name));
        return buf.byteLength;
      })
    );
    if (sizes.some(size => size < 1000)) {
      console.warn(
        `[capture-scoreboard-anim] WARNING: ${result.id} has a suspiciously small frame: ${sizes.join(", ")} bytes`
      );
    }
  }

  console.log(`[capture-scoreboard-anim] done — ${results.length} cases captured.`);
}

await main();
