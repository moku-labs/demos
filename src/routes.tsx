/**
 * @file Route table — `/` board list, `/b/{id}` board view (web Rule R2: one route table).
 */
import { createUrls, defineRoutes, route } from "@moku-labs/web/browser";
import { BoardListPage } from "./pages/BoardListPage";
import { BoardPage } from "./pages/BoardPage";

/** The application route map consumed by the router plugin. */
export const routes = defineRoutes({
  boards: route("/").render(() => <BoardListPage />),
  board: route("/b/{id}").render(ctx => <BoardPage id={ctx.params.id} />)
});

/** Pure, app-free URL builder over the route map (page links). */
export const urls = createUrls(routes, "en");
