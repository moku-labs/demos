/**
 * @file Generic HTTP response builders for the worker endpoint table — small, status-only `Response`
 * constructors so the route handlers stay declarative (`return notFound()` instead of an inline
 * `new Response(...)`). Pure and framework-free; shared across every endpoint group in `endpoints.ts`.
 */

/**
 * Build a `401 Unauthorized` text response — returned when a mutation has no resolvable actor.
 *
 * @returns A 401 `Response` with a plain-text body.
 * @example
 * ```ts
 * if (!actor) return unauthorized();
 * ```
 */
export const unauthorized = (): Response => new Response("unauthorized", { status: 401 });

/**
 * Build a `404 Not Found` text response — returned when a resource lookup misses.
 *
 * @returns A 404 `Response` with a plain-text body.
 * @example
 * ```ts
 * if (!board) return notFound();
 * ```
 */
export const notFound = (): Response => new Response("not found", { status: 404 });

/**
 * Build a `400 Bad Request` text response — returned when required input is missing/malformed.
 *
 * @param message - The plain-text body explaining what was wrong (defaults to `"bad request"`).
 * @returns A 400 `Response` with the given body.
 * @example
 * ```ts
 * if (!(file instanceof File)) return badRequest("missing file part");
 * ```
 */
export const badRequest = (message = "bad request"): Response =>
  new Response(message, { status: 400 });

/**
 * Build a `204 No Content` response — returned by deletes/reorders/toggles with no body.
 *
 * Uses an `undefined` body (never `null`) so the empty-success path stays house-style clean.
 *
 * @returns A 204 `Response` with an empty body.
 * @example
 * ```ts
 * await ctx.require(boardsPlugin).delete(ctx.env, ctx.params.id, actor);
 * return noContent();
 * ```
 */
export const noContent = (): Response => new Response(undefined, { status: 204 });
