/**
 * @file Bundler plugin of the dev page (`bunfig.toml`, `[serve.static]`): with `MOKU_ENGINE_SRC`
 * set by the runner, the page bundles the engine from the working tree's source instead of the
 * installed package, and the tree's imports of Pixi, core and common resolve from the demo, so
 * the page holds one copy of each. With `MOKU_EDITOR_ROOT` set (`test:editor --editor <path>`),
 * `@moku-labs/editor` and its entries come from that tree's build, and the tree's imports of the
 * engine, Pixi, core, common and preact resolve from the demo the same way. With no variable it
 * does nothing.
 */
import type { BunPlugin, PluginBuilder } from "bun";
import {
  demoRoot,
  editorEntries,
  editorRoot,
  engineEntries,
  engineSrc,
  entryOf,
  entrySource,
  isEditorShared,
  isShared
} from "./engine";

/**
 * Sends the engine's imports to an engine working tree.
 *
 * @param build - The bundler.
 * @param root - The engine working tree.
 */
function engineFromTree(build: PluginBuilder, root: string): void {
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

/**
 * Sends the editor's imports to the build of an editor working tree.
 *
 * @param build - The bundler.
 * @param root - The editor working tree.
 */
function editorFromTree(build: PluginBuilder, root: string): void {
  const entries = editorEntries(root);
  const tree = `${root}/`;

  build.onResolve({ filter: /^@moku-labs\/editor(\/[\w-]+)?$/ }, args => {
    const file = entries[args.path];

    return file === undefined ? undefined : { path: file };
  });
  build.onResolve({ filter: /^(pixi\.js|preact|@moku-labs\/(core|common|game))(\/.*)?$/ }, args =>
    args.importer.startsWith(tree) && isEditorShared(args.path)
      ? { path: Bun.resolveSync(args.path, demoRoot) }
      : undefined
  );
}

/** Sends the engine's and the editor's imports to the working trees the runner named. */
const engineBundle: BunPlugin = {
  name: "moku-engine-bundle",
  setup(build) {
    const engine = engineSrc();
    const editor = editorRoot();

    // The engine first: an editor tree's import of the engine then lands on the engine tree too.
    if (engine !== undefined) engineFromTree(build, engine);
    if (editor !== undefined) editorFromTree(build, editor);
  }
};

export default engineBundle;
