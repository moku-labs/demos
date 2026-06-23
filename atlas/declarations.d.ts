declare module "eslint-config-biome";

// Side-effect CSS imports (the colocated per-component sheets reached through `src/styles/main.css`).
// The framework build plugin bundles these via Bun.build; TypeScript only needs them to resolve as
// empty modules.
declare module "*.css";
