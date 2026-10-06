/**
 * @file The language pane of the settings popup: one plank per language.
 */
import { tr } from "@core/kit";
import { PlankButton } from "@shared";
import { languageColumn } from "../styles/styles";

/** The languages the player may choose, in the order they are drawn. */
const languages = [
  { locale: "ru", label: tr("settings.russian") },
  { locale: "en", label: tr("settings.english") }
] as const;

/**
 * The language pane: one plank per language across the paper, the current one green with a check.
 *
 * @param props - The current language.
 * @param props.locale - The locale the save holds.
 * @returns The column element.
 */
export function LanguagePane(props: { locale: string }) {
  return (
    <column key="languagePane" style={languageColumn}>
      {languages.map(language => (
        <PlankButton
          id={`language${language.locale === "ru" ? "Russian" : "English"}`}
          intent="setLocale"
          payload={{ locale: language.locale }}
          look="wood"
          size="full"
          selected={props.locale === language.locale}
          label={language.label}
        />
      ))}
    </column>
  );
}
