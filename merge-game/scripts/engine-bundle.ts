/**
 * @file Bundler plugin of the dev page (`bunfig.toml`, `[serve.static]`): with `MOKU_ENGINE_SRC`
 * set by the runner, the page bundles the engine from the working tree's source instead of the
 * installed package, and the tree's imports of Pixi, core and common resolve from the demo, so
 * the page holds one copy of each. With no variable it does nothing.
 */
import type { BunPlugin } from "bun";
import { demoRoot, engineEntries, engineSrc, entryOf, entrySource, isShared } from "./engine";

/** Sends the engine's imports to the working tree, when the runner named one. */
const engineBundle: BunPlugin = {
  name: "moku-engine-bundle",
  setup(build) {
    const root = engineSrc();

    if (root === undefined) return;

    const entries = new Set(engineEntries(root));
    const tree = `${root}/`;

    build.onResolve({ filter: /^@moku-labs\/game(\/[\w-]+)?$/ }, args => {
      const entry = entryOf(args.path);

      return entry !== undefined && entries.has(entry)
        ? { path: entrySource(root, entry) }
        : undefined;
    });
    build.onResolve({ filter: /^(pixi\.js|@moku-labs\/(core|common))(\/.*)?$/ }, args =>
      args.importer.startsWith(tree) && isShared(args.path)
        ? { path: Bun.resolveSync(args.path, demoRoot) }
        : undefined
    );
  }
};

export default engineBundle;
