/**
 * @file Island registry — the surfaces the SPA hydrates. One island here: the todo screen, bound to
 * the `data-island="todo-app"` host in {@link file://../pages/HomePage.tsx}. Registered here →
 * `pluginConfigs.spa.islands` in `spa.tsx`.
 */
import { todoAppIsland } from "./todo-app";

/** Every island registered with the spa plugin's component registry. */
export const islands = [todoAppIsland];
