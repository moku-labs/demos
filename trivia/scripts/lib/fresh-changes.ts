/**
 * @file Dev-watcher guard — drop APFS clone-echo "changes" so the dev loop can't feed itself.
 *
 * On macOS/APFS, Bun's `fs.cp` copies large files via `clonefile(2)`, and FSEvents then reports the
 * clone SOURCE path as changed (an `ItemCloned` echo) even though its inode is untouched. The worker
 * dev watcher watches `public/**`, and every incremental rebuild re-copies `public/` into
 * `dist/client` — so each rebuild echoes phantom "changes" for the large public assets (the >128KB
 * sfx tracks), which would schedule another rebuild, forever: a ~1/s rebuild → wrangler-reload storm
 * that tears down the Hub DO and every in-flight signaling WebSocket. A clone echo never modifies
 * the source inode (mtime AND ctime stay put), so a batch is real only if some path in it actually
 * changed on disk since the last applied rebuild.
 */
import { statSync } from "node:fs";

/**
 * Whether a changed-path batch contains at least one REAL change since `sinceMs`: a path whose
 * `max(mtime, ctime)` is newer, or a path that no longer exists (a deletion — clone echoes never
 * remove the source). A batch of pure clone echoes (all paths present, all timestamps older)
 * returns `false` and the caller skips the rebuild, breaking the feedback loop.
 *
 * @param paths - The watcher's debounced changed-path batch (relative to the trivia root).
 * @param sinceMs - The epoch-ms threshold — when the last applied rebuild started.
 * @returns `true` when some path really changed (rebuild), `false` for echo-only batches (skip).
 * @example
 * ```ts
 * if (!hasFreshChange(changes, lastApplied)) return { files: 0 }; // clone echo — skip
 * ```
 */
export function hasFreshChange(paths: readonly string[], sinceMs: number): boolean {
  return paths.some(path => {
    try {
      const stats = statSync(path);
      return Math.max(stats.mtimeMs, stats.ctimeMs) > sinceMs;
    } catch {
      return true;
    }
  });
}
