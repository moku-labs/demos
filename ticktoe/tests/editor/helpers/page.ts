/**
 * @file The page of the editor scenarios: a happy-dom `Window` built by hand in the node
 * environment (the `@vitest-environment happy-dom` pragma would make `import.meta.url` http and
 * break the file reads of the game). One document holds the game page and the tools root.
 * `WebSocket` and `fetch` are never stubbed: they stay Bun's.
 */
import { GlobalWindow } from "happy-dom";
import { vi } from "vitest";

/** The installed page. */
export type Page = {
  /** A happy-dom `GlobalWindow`: a `Window` that also carries the JS globals (`Error`, `Date`…). */
  readonly window: GlobalWindow;
  /** `[data-editor-root]`: where the tools workspace mounts. */
  readonly root: HTMLElement;
  /** `[data-game-page]`: where the agent overlay mounts. */
  readonly gamePage: HTMLElement;
};

/** The box every element of the page answers: a window larger than every device preset. */
const LAID_OUT = { width: 1440, height: 1920 };

/** The page installed in this test file, if any. One test file is one module, so one page. */
const installed: { page: Page | undefined } = { page: undefined };

/**
 * The page `installPage` installed, or undefined.
 *
 * @returns The page.
 */
export function currentPage(): Page | undefined {
  return installed.page;
}

/**
 * One element of the stubbed document, failing loudly when it is missing.
 *
 * @param selector - A CSS selector.
 * @returns The element.
 * @throws {Error} When no element matches.
 */
function elementOf(selector: string): HTMLElement {
  const element = globalThis.document.querySelector<HTMLElement>(selector);
  if (element === null) throw new Error(`the page has no ${selector}`);
  return element;
}

/**
 * The globals the tools mount and the agent overlay read, taken from the page window. Functions
 * that need their window are bound to it.
 *
 * @param window - The page window.
 * @returns Global name to value.
 */
function pageGlobals(window: GlobalWindow) {
  return {
    window,
    document: window.document,
    location: window.location,
    localStorage: window.localStorage,
    HTMLElement: window.HTMLElement,
    HTMLIFrameElement: window.HTMLIFrameElement,
    HTMLDialogElement: window.HTMLDialogElement,
    HTMLInputElement: window.HTMLInputElement,
    HTMLTextAreaElement: window.HTMLTextAreaElement,
    HTMLButtonElement: window.HTMLButtonElement,
    HTMLSelectElement: window.HTMLSelectElement,
    Element: window.Element,
    Node: window.Node,
    Text: window.Text,
    ShadowRoot: window.ShadowRoot,
    CSSStyleSheet: window.CSSStyleSheet,
    Event: window.Event,
    CustomEvent: window.CustomEvent,
    KeyboardEvent: window.KeyboardEvent,
    MouseEvent: window.MouseEvent,
    PointerEvent: window.PointerEvent,
    WheelEvent: window.WheelEvent,
    MutationObserver: window.MutationObserver,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    getComputedStyle: window.getComputedStyle.bind(window),
    requestAnimationFrame: window.requestAnimationFrame.bind(window),
    cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
    matchMedia: window.matchMedia.bind(window)
  };
}

/**
 * Builds the page at `<origin><path>/` and stubs its globals: body
 * `<div data-game-page></div><div data-editor-root></div>`, iframe page loading off. Stubbing
 * `location` makes the agent page count as embedded (Bun's `self` is not `window.top`, and the
 * parent's origin is the page origin). `shutdown` closes it and unstubs the globals.
 *
 * @param origin - The server origin, e.g. `http://127.0.0.1:4417`.
 * @param path - The hub path. Default `/__editor`.
 * @returns The page.
 */
export function installPage(origin: string, path = "/__editor"): Page {
  // GlobalWindow, not Window: code that reads JS globals off `window` (elkjs reads
  // `window.Error` and `window.Date` for the inline flowView layout) finds them.
  const window = new GlobalWindow({
    url: `${origin}${path}/`,
    settings: { disableIframePageLoading: true }
  });
  window.document.body.innerHTML = "<div data-game-page></div><div data-editor-root></div>";
  // happy-dom lays nothing out: every element answers an empty box, the game frame would get the
  // scale 0 and a click on it would land on nothing. Every element answers this box instead, so
  // the frame fits its stage at a real scale and a test reads where it is from `gameFrame().box()`.
  const box = new window.DOMRect(0, 0, LAID_OUT.width, LAID_OUT.height);
  vi.spyOn(window.Element.prototype, "getBoundingClientRect").mockReturnValue(box);
  for (const [name, value] of Object.entries(pageGlobals(window))) vi.stubGlobal(name, value);

  const page = {
    window,
    root: elementOf("[data-editor-root]"),
    gamePage: elementOf("[data-game-page]")
  };
  installed.page = page;
  return page;
}

/**
 * Closes the installed page window (its timers stop). The globals are unstubbed by `shutdown`.
 *
 * @returns Resolves when the window is closed.
 */
export async function closePage(): Promise<void> {
  const { page } = installed;
  installed.page = undefined;
  await page?.window.happyDOM.close();
}

/**
 * Runs `start` with the page hidden (`window`, `document`, `requestAnimationFrame`,
 * `cancelAnimationFrame` undefined) and puts the page back after, whatever happens. A game started
 * inside counts as headless: no real frame loop (frames move only when a test steps them), an
 * inert renderer.
 *
 * @param start - Creates and starts the game.
 * @returns What `start` resolved with.
 */
export async function withoutPage<Started>(start: () => Promise<Started>): Promise<Started> {
  const saved = {
    window: globalThis.window,
    document: globalThis.document,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame
  };
  for (const name of Object.keys(saved)) vi.stubGlobal(name, undefined);
  try {
    return await start();
  } finally {
    for (const [name, value] of Object.entries(saved)) vi.stubGlobal(name, value);
  }
}
