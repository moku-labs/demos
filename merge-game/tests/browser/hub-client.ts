/**
 * @file A headless tools client of the hub, as the MCP bridge is one: a raw websocket with
 * `kind=tools` and no role. It sends editor-channel requests. `select { key }` is how a spec picks
 * one element by its ui key: the editor page picks it like a picker click, but without the
 * clipboard (bookmark, the crop, the full frame, the card), and answers the selection with its
 * `card`, `crop` and `line`.
 */
import type { Page } from "@playwright/test";

/** A rect in px. */
type Rect = { readonly x: number; readonly y: number; readonly w: number; readonly h: number };

/** The fields of a SelectionInfo the specs read. */
export type Selection = {
  readonly key?: string;
  readonly name: string;
  readonly type: string;
  readonly rect?: Rect;
  readonly card?: string;
  readonly crop?: string;
  readonly line?: string;
};

/** One JSON-RPC message from the hub. */
export type Message = {
  readonly id?: number;
  readonly channel?: string;
  readonly method?: string;
  readonly params?: unknown;
  readonly result?: unknown;
  readonly error?: { readonly code: number; readonly message: string };
};

/** A headless tools client of the hub. */
export type ToolsClient = {
  /** Sends an editor-channel request and resolves its answer. */
  call(method: string, params: object): Promise<Message>;
  /** The params of every editor-channel notification of a method received so far. */
  notes(method: string): unknown[];
  /** Closes the socket. */
  close(): void;
};

/** The boot JSON of the tools page: the socket URL and the per-start token. */
type Boot = { readonly ws: string; readonly token: string };

/**
 * Connects a plain tools client to the hub the tools page uses: the socket URL and the token of
 * the page's boot JSON, the page origin as the Origin header (the hub's upgrade guard wants one),
 * `kind=tools` and no role.
 *
 * @param page - The tools page.
 * @returns The client, once its socket is open.
 */
export async function connectTools(page: Page): Promise<ToolsClient> {
  const boot = JSON.parse((await page.locator("#moku-editor-boot").textContent()) ?? "{}") as Boot;
  const url = `${boot.ws}?token=${encodeURIComponent(boot.token)}&kind=tools`;
  const origin = new URL(page.url()).origin;
  // Node's WebSocket takes headers; the DOM typing of the constructor does not know them.
  const socket = Reflect.construct(WebSocket, [url, { headers: { origin } }]) as WebSocket;

  const received: Message[] = [];
  const answers = new Map<number, (message: Message) => void>();
  socket.addEventListener("message", event => {
    const message = JSON.parse(String(event.data)) as Message;
    const answer = message.id === undefined ? undefined : answers.get(message.id);
    if (message.method === undefined && answer !== undefined) answer(message);
    else received.push(message);
  });
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true });
    socket.addEventListener("error", () => reject(new Error("the tools socket did not open")), {
      once: true
    });
  });

  let nextId = 1;
  return {
    call: (method, params) =>
      new Promise(resolve => {
        const id = nextId;
        nextId += 1;
        answers.set(id, resolve);
        socket.send(JSON.stringify({ jsonrpc: "2.0", id, channel: "editor", method, params }));
      }),
    notes: method =>
      received
        .filter(message => message.channel === "editor" && message.method === method)
        .map(message => message.params),
    close: () => socket.close(1000)
  };
}

/**
 * Picks one element by its ui key over the hub (`editor.select`), on a client of its own.
 *
 * @param page - The tools page.
 * @param key - The ui key.
 * @returns The selection the editor page answered, with its card, crop and line.
 * @throws {Error} When the editor refuses the key or answers no card.
 */
export async function selectByKey(page: Page, key: string): Promise<Selection> {
  const client = await connectTools(page);
  try {
    const answer = await client.call("select", { key });
    if (answer.error !== undefined) {
      throw new Error(`select ${key}: ${String(answer.error.code)} ${answer.error.message}`);
    }
    const selection = answer.result as Selection;
    if (selection.key !== key || selection.card === undefined || selection.line === undefined) {
      throw new Error(`select ${key} answered ${JSON.stringify(selection)}`);
    }
    return selection;
  } finally {
    client.close();
  }
}
