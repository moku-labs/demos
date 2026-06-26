declare module "eslint-config-biome";

// Side-effect CSS imports (e.g. `import "./styles/main.css"` in the future SPA entry). The framework
// build plugin bundles these via Bun.build; TypeScript only needs them to resolve as empty modules.
declare module "*.css";

// `@moku-labs/room/server` (room 0.2.0) ships its runtime (`server.mjs`) but NO type declarations —
// its `exports["./server"]` has no `types` condition. This ambient module gives the worker entry
// (`src/cloudflare/worker.ts`) + the server composition (`src/server.ts`) the minimal typed surface
// they use. SKELETON REVISIT: drop this block once room publishes server-core types.
declare module "@moku-labs/room/server" {
  /** The composed room server app — `hub.handle` is the fetch the Cloudflare entry delegates to. */
  interface RoomServerApp {
    readonly hub: {
      /** Serve ASSETS (incl. the /controller/{code} deep-link) AND the signaling WS upgrade. */
      handle(request: Request, env: unknown, ctx: ExecutionContext): Promise<Response>;
    };
  }

  /** Create the room server (signaling) app — the `hub` plugin is wired by default. */
  export function createApp(options?: Record<string, unknown>): RoomServerApp;

  /** The `Hub` Durable Object class — re-export from the worker entry so wrangler binds `ROOM_HUB`. */
  export const Hub: { new (state: DurableObjectState, env: unknown): object };

  /** The `hub` plugin instance (server-core default; exported for custom composition). */
  export const hubPlugin: unknown;
}
