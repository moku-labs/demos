/**
 * @file The payload of the `locale` effect the plugin answers.
 */

/**
 * What a node puts into `fx({ kind: "locale", payload })`: the locale to switch to.
 *
 * @example
 * ```ts
 * const payload: LocalePayload = { locale: "en" };
 * ```
 */
export type LocalePayload = {
  /** The locale `i18n` switches to, for example `"ru"` or `"en"`. */
  locale?: string;
};
