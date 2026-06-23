/**
 * @file Avatar — an assignee/reporter mark: the person's initials on their signature colour. The
 * colour is selected in CSS by `data-person` (`--avatar-ak/ml/rt/js`), so the component carries no
 * inline colour. `data-lead` flags the assignment lead (design context §7 "Assignees: lead marked").
 */
import type { Person } from "../lib/types";

/** Props for {@link Avatar}. */
export interface AvatarProps {
  /** The person to depict. */
  person: Person;
  /** Whether this person is the assignment lead (gets the accent ring). */
  lead?: boolean;
  /** Size tier — `sm` for cards/list, `md` default, `lg` for the byline. */
  size?: "sm" | "md" | "lg";
}

/**
 * Render a person's initials avatar on their signature colour.
 *
 * @param props - The avatar props.
 * @param props.person - The person to depict.
 * @param props.lead - Whether this person is the assignment lead.
 * @param props.size - Size tier (`sm` | `md` | `lg`).
 * @returns The avatar element.
 * @example
 * ```tsx
 * <Avatar person={{ id: "ak", name: "Anya Kovač", initials: "AK" }} lead />
 * ```
 */
export function Avatar({ person, lead, size = "md" }: AvatarProps) {
  // A signed-in user carries a chosen palette-token colour; paint it via the existing `--avatar-fallback`
  // hook (the `data-person` token rules only match the static cast, so a `u_…` user falls through to it).
  const style = person.color ? `--avatar-fallback:var(${person.color})` : undefined;
  return (
    <span
      data-avatar
      data-person={person.id}
      data-size={size}
      data-lead={lead ? "" : undefined}
      role="img"
      title={person.name}
      aria-label={person.name}
      style={style}
    >
      {person.initials}
    </span>
  );
}
