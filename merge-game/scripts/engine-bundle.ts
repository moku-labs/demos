/**
 * @file Bundler plugin of the dev page (`bunfig.toml`, `[serve.static]`): with `MOKU_ENGINE_SRC`
 * set by the runner, the page bundles the engine from the working tree's source instead of the
 * installed package, and the tree's imports of Pixi, core and common resolve from the demo, so
 * the page holds one copy of each. With `MOKU_EDITOR_ROOT` set (`test:editor --editor <path>`),
 * `@moku-labs/editor` and its entries come from that tree's build, and the tree's imports of the
 * engine, Pixi, core, common and preact land on the demo's copies. With no variable it
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

/** A bare import in a built file: `from "x"`, `import "x"`, `import("x")`. */
const BARE_IMPORT = /(from |import |import\()"([^"./][^"]*)"/gu;

/**
 * The file a shared import of the editor tree lands on: the engine tree's source for an engine
 * entry when `--engine <path>` is set, else the demo's copy.
 *
 * @param specifier - The import, such as `@moku-labs/game/inspect`.
 * @param engine - The engine working tree, or `undefined`.
 * @returns The absolute path of the file.
 */
function sharedFile(specifier: string, engine: string | undefined): string {
  const entry = entryOf(specifier);

  if (engine !== undefined && entry !== undefined && engineEntries(engine).includes(entry)) {
    return entrySource(engine, entry);
  }

  return Bun.resolveSync(specifier, demoRoot);
}

/**
 * Sends the editor's imports to the build of an editor working tree.
 *
 * The tree's shared imports are rewritten to absolute paths when its files load. An `onResolve`
 * that sends them to the demo's engine breaks the dev server: the engine's `dist` modules then
 * come out with no imports, and the game fails on `defineGame is not a function`.
 *
 * @param build - The bundler.
 * @param root - The editor working tree.
 * @param engine - The engine working tree, or `undefined`.
 */
function editorFromTree(build: PluginBuilder, root: string, engine: string | undefined): void {
  const entries = editorEntries(root);

  build.onResolve({ filter: /^@moku-labs\/editor(\/[\w-]+)?$/ }, args => {
    const file = entries[args.path];

    return file === undefined ? undefined : { path: file };
  });
  build.onLoad({ filter: new RegExp(`^${RegExp.escape(root)}/.*\\.m?js$`, "u") }, async args => {
    const text = await Bun.file(args.path).text();
    const contents = text.replaceAll(BARE_IMPORT, (whole, head: string, specifier: string) =>
      isEditorShared(specifier)
        ? `${head}${JSON.stringify(sharedFile(specifier, engine))}`
        : whole
    );

    return { contents, loader: "js" };
  });
}

/** Sends the engine's and the editor's imports to the working trees the runner named. */
const engineBundle: BunPlugin = {
  name: "moku-engine-bundle",
  setup(build) {
    const engine = engineSrc();
    const editor = editorRoot();

    if (engine !== undefined) engineFromTree(build, engine);
    if (editor !== undefined) editorFromTree(build, editor, engine);
  }
};

export default engineBundle;
