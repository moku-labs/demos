/**
 * @file Build-time git identity — read once by `scripts/build.ts` + `scripts/dev.ts` and emitted to
 * `dist/client/build-info.json`, the static asset the TV lobby fetches to show which build is running (so
 * a deployed device's exact version is identifiable at a glance — no more "which bundle are my phones on?").
 */
import { spawnSync } from "node:child_process";

/** The build identity surfaced on the lobby: the commit short hash, its subject line, and ISO date. */
export type BuildInfo = { commit: string; subject: string; date: string };

/**
 * Read the current git commit's short hash, subject line, and committer ISO date. Falls back to a `dev`
 * marker when git is unavailable (a detached tarball / non-repo build) so the emit never fails the build.
 *
 * @returns The git-derived build identity, or a `dev` fallback when git can't be read.
 * @example
 * ```ts
 * await Bun.write(`${outDir}/build-info.json`, JSON.stringify(gitBuildInfo()));
 * ```
 */
export function gitBuildInfo(): BuildInfo {
  const read = (args: string[]): string => {
    const result = spawnSync("git", args, { encoding: "utf8" });
    return result.status === 0 ? result.stdout.trim() : "";
  };

  const commit = read(["rev-parse", "--short", "HEAD"]);
  if (!commit) return { commit: "dev", subject: "local build", date: "" };

  return {
    commit,
    subject: read(["log", "-1", "--format=%s"]),
    date: read(["log", "-1", "--format=%cI"])
  };
}
