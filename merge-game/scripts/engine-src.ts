/**
 * @file Bun preload (`bunfig.toml`): with `MOKU_ENGINE_SRC` set by the runner, every entry of the
 * installed engine (`node_modules/@moku-labs/game/dist/<entry>.mjs`) loads the source of that
 * entry from the engine working tree instead. With no variable it does nothing.
 *
 * The tree's own imports of Pixi, core and common resolve from the tree's `node_modules` here:
 * Bun calls no runtime `onResolve` for them. That is safe in Bun, because the game imports none
 * of the three itself; vitest and the dev page bundle do dedupe them to the demo's copy.
 */
import { readFileSync } from "node:fs";
import { plugin } from "bun";
import { engineEntries, engineSrc, entrySource } from "./engine";

const root = engineSrc();

if (root !== undefined) {
  const dist = new RegExp(
    `node_modules/@moku-labs/game/dist/(${engineEntries(root).join("|")})\\.mjs$`
  );

  plugin({
    name: "moku-engine-src",
    setup(build) {
      build.onLoad({ filter: dist }, args => {
        const file = JSON.stringify(entrySource(root, dist.exec(args.path)?.[1] ?? "index"));
        // `export *` leaves the default out: `hot` and `lint` export a plugin as their default.
        const hasDefault = /^export default /mu.test(
          readFileSync(JSON.parse(file) as string, "utf8")
        );
        const contents = `export * from ${file};${hasDefault ? ` export { default } from ${file};` : ""}`;

        return { contents, loader: "js" };
      });
    }
  });
}
