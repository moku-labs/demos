declare module "eslint-config-biome";

// Side-effect CSS imports (e.g. `import "./styles/main.css"` in the future SPA entry). The framework
// build plugin bundles these via Bun.build; TypeScript only needs them to resolve as empty modules.
declare module "*.css";

// `qrcode` (room's transitive dep, declared directly so the bridge can encode the `/code/{code}` join
// URL into a QrMatrix host-side) ships no bundled types and we don't pull `@types/qrcode` for the single
// `create()` call we use. This ambient block types only that surface — `create(text).modules` is a
// row-major bit matrix with `size` + `get(row, col)`.
declare module "qrcode" {
  /** A row-major bit matrix: `get(row, col)` is truthy for a dark module. */
  interface BitMatrix {
    readonly size: number;
    get(row: number, col: number): number;
  }
  /** The encoded symbol returned by {@link create}. */
  interface QRCodeSymbol {
    readonly modules: BitMatrix;
  }
  /** Encode `text` into a QR symbol (pure; no canvas/DOM — safe in the browser bundle). */
  export function create(text: string, options?: { errorCorrectionLevel?: string }): QRCodeSymbol;
}

// `@moku-labs/room/server` ships its runtime (`server.mjs`) but NO type declarations — its
// `exports["./server"]` has no `types` condition (the `Hub` DO types reference @cloudflare/workers-types
// ambient globals tsdown can't portably re-emit). It exports `hubPlugin` (a @moku-labs/worker plugin the
// app composes into its own worker `createApp`) + the `Hub` DO class; this ambient block gives them the
// minimal typed surface `src/server.ts` + `src/cloudflare/worker.ts` use. REVISIT: drop once room ships
// hand-authored `./server` types (a room-release follow-up; see STATE.md).
declare module "@moku-labs/room/server" {
  /** The hub api mounted at `server.hub` — the sole worker fetch handler (signaling WS / else → ASSETS). */
  type HubApi = {
    /** Serve ASSETS (incl. the /code/{code} deep-link) AND the signaling WS upgrade. */
    handle(request: Request, env: unknown, ctx: ExecutionContext): Promise<Response>;
  };

  /** `hubPlugin` — a @moku-labs/worker plugin; composing it contributes `server.hub: HubApi`. */
  export const hubPlugin: import("@moku-labs/core").PluginInstance<
    "hub",
    Record<string, unknown>,
    Record<string, never>,
    HubApi,
    Record<string, never>
  >;

  /** The `Hub` Durable Object class — re-export from the worker entry so wrangler binds `ROOM_HUB`. */
  export const Hub: { new (state: DurableObjectState, env: unknown): object };
}
