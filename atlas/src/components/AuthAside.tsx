/**
 * @file AuthAside — the left half of the auth split (design context §6 A1): wordmark, the headline
 * *"The newsroom for good software,"* a one-line manifesto, and the live stats (departments / boards /
 * issues filed). The stats sit in a `[data-island="auth-stats"]` mount with representative SSR numbers
 * as a no-JS fallback; the Phase-C auth island refreshes them from the public stats endpoint.
 */
import { StatBlock } from "./StatBlock";

/** Props for {@link AuthAside}. */
export interface AuthAsideProps {
  /** Home href, built from the route map by the layout. */
  homeHref: string;
}

/**
 * Render the editorial auth aside — masthead, headline, manifesto, and live stats.
 *
 * @param props - The aside props.
 * @param props.homeHref - Home href built from the route map.
 * @returns The aside element.
 * @example
 * ```tsx
 * <AuthAside homeHref={ctx.url("home", {})} />
 * ```
 */
export function AuthAside({ homeHref }: AuthAsideProps) {
  return (
    <aside data-auth-aside>
      <a data-wordmark href={homeHref}>
        Atlas<span data-stop>.</span>
      </a>

      <div data-auth-lead>
        <p data-eyebrow>The Atlas Edition</p>
        <h1 data-auth-headline>
          The newsroom for <em>good software.</em>
        </h1>
        <p data-auth-manifesto>
          Every issue filed like a story, every board an edition. A tracker that reads like a
          publication — calm, legible, quietly confident.
        </p>
      </div>

      <div data-island="auth-stats" data-auth-stats>
        <StatBlock value={5} label="Departments" />
        <StatBlock value={9} label="Boards" />
        <StatBlock value={24} label="Issues filed" />
      </div>
    </aside>
  );
}
