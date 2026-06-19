declare module "eslint-config-biome";

// Side-effect CSS imports (e.g. `import "./styles/index.css"` in src/spa.tsx). The framework build
// plugin bundles these via Bun.build; TypeScript only needs them to resolve as empty modules.
declare module "*.css";
