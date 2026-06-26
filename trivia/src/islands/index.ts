/**
 * @file Island registry — the two persistent surfaces the SPA hydrates (web Rule R2). Each is a
 * `createIsland(...)` bound to a `data-island="…"` host in the page markup; the spa plugin mounts the
 * matching island on every host it finds. Registered here → `pluginConfigs.spa.islands` in spa.tsx.
 */
import { controllerIsland } from "./controller";
import { stageIsland } from "./stage";

/** Every island registered with the spa plugin's component registry (wired in `spa.tsx`). */
export const islands = [stageIsland, controllerIsland];
