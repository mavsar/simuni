export type EmailTemplateType = "price_confirmation" | "online_reservation";

export type EmailTemplatePlaceholder = {
  key: string;
  description: string;
};

export type EmailTemplateDefinition = {
  type: EmailTemplateType;
  label: string;
  description: string;
  defaultSubject: string;
  defaultBody: string;
  placeholders: EmailTemplatePlaceholder[];
  /** Values used to render a preview in the admin UI, without sending anything. */
  sampleValues: Record<string, string>;
  /**
   * Present only for templates that always send to one fixed address (e.g.
   * the camping reception) rather than a family's own inbox. Its presence is
   * what tells the admin UI to show a recipient field for this template.
   */
  recipientLabel?: string;
  defaultRecipient?: string;
};

/**
 * Catalog of every email the app sends. Add a new entry here (and a matching
 * `sendMail` call site using `getEffectiveTemplate`/`renderTemplate`) for each
 * new automated email — the "Emaili" admin page lists whatever is in here.
 */
export const EMAIL_TEMPLATE_DEFINITIONS: EmailTemplateDefinition[] = [
  {
    type: "price_confirmation",
    label: "Cene potrjene",
    description:
      "Pošlje se vsaki družini (razen izvzetih iz plačila), ko admin potrdi cene za posamezno leto.",
    defaultSubject: "Šimuni – cene za leto {year} so potrjene",
    defaultBody:
      "Pozdravljeni {familyName},\n\n" +
      "cene za leto {year} so potrjene. Vaš znesek za plačilo:\n\n" +
      "{lines}\n\n" +
      "Skupaj za leto {year}:\n" +
      "  Šimuni: {totalSimuni}\n" +
      "  Bungalov: {totalBungalov}\n" +
      "  Skupaj: {totalAmount}\n\n" +
      "Lep pozdrav,\nŠimuni",
    placeholders: [
      { key: "familyName", description: "Ime družine" },
      { key: "year", description: "Leto, za katero so cene potrjene" },
      { key: "lines", description: "Seznam rezervacij tega leta z zneski" },
      { key: "totalSimuni", description: "Skupni znesek za Šimuni" },
      { key: "totalBungalov", description: "Skupni znesek za bungalov" },
      { key: "totalAmount", description: "Skupni znesek (Šimuni + bungalov)" }
    ],
    sampleValues: {
      familyName: "Novak",
      year: "2026",
      lines:
        "11. 7. 2026 – 22. 7. 2026\n  Za plačati Šimuni: 350,00 €\n  Za plačati bungalov: 210,00 €\n  Skupaj: 560,00 €",
      totalSimuni: "350,00 €",
      totalBungalov: "210,00 €",
      totalAmount: "560,00 €"
    }
  },
  {
    type: "online_reservation",
    label: "Online rezervacija",
    description:
      "Ročno ali samodejno (teden dni pred prihodom) sporočilo za prijavo rezervacije recepciji kampa. Kopija gre v skriti kopiji (BCC) tudi družini.",
    defaultSubject: "Online rezervacija – Bungalov 41 ({startDay} – {endDay})",
    defaultBody:
      "Pozdravljeni,\n\n" +
      "prijavljam rezervacijo bungalova za družino {familyName}.\n\n" +
      "Datum prihoda: {startDay}\n" +
      "Datum odhoda: {endDay}\n\n" +
      "Osebe:\n{persons}\n\n" +
      "Vozila (registrske številke): {cars}\n\n" +
      "Lep pozdrav,\nPrimož Mavsar",
    placeholders: [
      { key: "familyName", description: "Ime družine" },
      { key: "startDay", description: "Datum prihoda" },
      { key: "endDay", description: "Datum odhoda" },
      { key: "persons", description: "Seznam oseb z osebnimi podatki, po eden na vrstico" },
      { key: "cars", description: "Registrske številke vozil, ločene z vejico" }
    ],
    sampleValues: {
      familyName: "Novak",
      startDay: "11. 7. 2026",
      endDay: "22. 7. 2026",
      persons:
        "- Janez Novak / osobna iskaznica: 12345678 / rođ. 5. 5. 1985 / na paušalu\n" +
        "- Ana Novak / rođ. 12. 8. 1987",
      cars: "LJ-04-INV, LJ-05-NDD"
    },
    recipientLabel: "E-pošta recepcije",
    defaultRecipient: ""
  }
];

/** Replaces every `{key}` in `template` with `vars[key]`; unknown keys are left as-is. */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match
  );
}
