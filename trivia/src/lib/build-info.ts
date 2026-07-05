/**
 * @file Client-side build identity — fetches `/build-info.json` (emitted git-derived at build time by
 * `scripts/build.ts`) so the TV lobby can show which build is running. Runtime-fetched (not bundled) so the
 * value tracks the deployed artifact exactly, with zero source-tree generation.
 */

/* eslint-disable unicorn/no-null -- the view layer speaks `null` for "no build info" (older build / offline). */

/** The build identity shown on the lobby: commit short hash, its subject line, and ISO date. */
export type BuildInfo = { commit: string; subject: string; date: string };

/**
 * Fetch the build identity emitted to `/build-info.json` at build time. Resolves `null` when it is absent
 * (a build without the emit) or unreachable — the lobby simply omits the badge then, never erroring.
 *
 * @returns The build identity, or `null` when unavailable.
 * @example
 * ```ts
 * const info = await fetchBuildInfo();
 * if (info) ctx.set({ buildInfo: info });
 * ```
 */
export async function fetchBuildInfo(): Promise<BuildInfo | null> {
  try {
    const res = await fetch("/build-info.json", { cache: "no-store" });
    if (!res.ok) return null;
    const raw = (await res.json()) as Partial<BuildInfo> | null;
    if (!raw || typeof raw.commit !== "string" || raw.commit === "") return null;
    return { commit: raw.commit, subject: raw.subject ?? "", date: raw.date ?? "" };
  } catch {
    return null;
  }
}
