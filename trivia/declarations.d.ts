declare module "eslint-config-biome";

// Side-effect CSS imports (e.g. `import "./styles/main.css"` in the future SPA entry). The framework
// build plugin bundles these via Bun.build; TypeScript only needs them to resolve as empty modules.
declare module "*.css";

// `@moku-labs/room/server` ships its runtime (`server.mjs`) but NO type declarations — its
// `exports["./server"]` has no `types` condition (the `Hub` DO types reference @cloudflare/workers-types
// ambient globals tsdown can't portably re-emit). It exports `hubPlugin` (a @moku-labs/worker plugin the
// app composes into its own worker `createApp`) + the `Hub` DO class; this ambient block gives them the
// minimal typed surface `src/server.ts` + `src/cloudflare/worker.ts` use. REVISIT: drop once room ships
// hand-authored `./server` types (a room-release follow-up; see STATE.md).
declare module "@moku-labs/room/server" {
  /** The hub api mounted at `server.hub` — the sole worker fetch handler (signaling WS / else → ASSETS). */
  type HubApi = {
    /** Serve ASSETS (incl. the /controller/{code} deep-link) AND the signaling WS upgrade. */
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
