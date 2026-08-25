import { Languages, RotateCcw, Save, Send } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '../components/ui/Button';
import { AlertBox, Card } from '../components/ui/Card';
import { Combobox, type ComboboxOption } from '../components/ui/Combobox';
import { baseFieldClass } from '../components/ui/Input';
import { Label } from '../components/ui/Label';
import { api } from '../lib/api';
import { formatDayRange } from '../lib/dates';
import { formatEur, type ReservationBreakdownData } from '../lib/pricing';
import type { EmailTemplate, Family, IdType, Person, Reservation } from '../lib/types';

/** No family has id 0, so this never matches a real option — the combobox just shows its placeholder. */
const NO_FAMILY_SELECTED = 0;

type Draft = { subject: string; body: string; recipient: string; bcc: string };

function draftFrom(template: EmailTemplate): Draft {
  return {
    subject: template.subject,
    body: template.body,
    recipient: template.recipient,
    bcc: template.bcc
  };
}

/** Client-side mirror of the server's `{key}` substitution, for a live preview as the admin types. */
function renderPreview(text: string, values: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match
  );
}

/**
 * Real placeholder values for one family's "prices confirmed" email, built
 * from the same per-reservation breakdown the actual send freezes into a
 * snapshot. Picks the nearest year (current or later) the family has a
 * reservation in, falling back to their latest past one. Returns `null` when
 * the family has no reservations at all — the caller falls back to samples.
 */
function buildPriceConfirmationVars(
  family: { id: number; familyName: string },
  reservations: Reservation[],
  breakdownsById: Map<number, ReservationBreakdownData>
): Record<string, string> | null {
  const familyReservations = reservations.filter((r) => r.userId === family.id);
  if (familyReservations.length === 0) return null;

  const currentYear = new Date().getFullYear();
  const years = [...new Set(familyReservations.map((r) => Number(r.startDay.slice(0, 4))))].sort(
    (a, b) => a - b
  );
  const year = years.find((y) => y >= currentYear) ?? years[years.length - 1];

  const yearReservations = familyReservations.filter(
    (r) => Number(r.startDay.slice(0, 4)) === year
  );

  const lineTexts: string[] = [];
  let totalSimuni = 0;
  let totalBungalov = 0;
  let totalAmount = 0;
  for (const reservation of yearReservations) {
    const breakdown = breakdownsById.get(reservation.id);
    if (!breakdown) continue;
    lineTexts.push(
      `${formatDayRange(reservation.startDay, reservation.endDay)}\n  Za plačati Šimuni: ${formatEur(
        breakdown.simuni
      )}\n  Za plačati bungalov: ${formatEur(breakdown.bungalov)}\n  Skupaj: ${formatEur(breakdown.total)}`
    );
    totalSimuni += breakdown.simuni;
    totalBungalov += breakdown.bungalov;
    totalAmount += breakdown.total;
  }
  if (lineTexts.length === 0) return null;

  return {
    familyName: family.familyName,
    year: String(year),
    lines: lineTexts.join('\n\n'),
    totalSimuni: formatEur(totalSimuni),
    totalBungalov: formatEur(totalBungalov),
    totalAmount: formatEur(totalAmount)
  };
}

/** `YYYY-MM-DD` → `D. M. YYYY` — matches the server's formatting exactly. */
function formatDay(dayKey: string): string {
  const [year, month, day] = dayKey.split('-').map(Number);
  return `${day}. ${month}. ${year}`;
}

// Always Croatian — this block is data addressed to the (Croatian) camp
// reception, not admin-editable prose, so it never goes through the
// translate button. Mirrors onlineReservationEmails.ts on the server.
const ID_TYPE_LABEL: Record<IdType, string> = {
  id_card: 'osobna iskaznica',
  drivers_license: 'vozačka dozvola',
  passport: 'putovnica'
};

/** `Ime Priimek / osobna iskaznica: 123 / rođ. D. M. YYYY / na paušalu` — the
 * ID segment is omitted when no number is on file, "na paušalu" only when true. */
function formatPersonsBlock(persons: Person[]): string {
  if (persons.length === 0) return '/';
  return persons
    .map((person) => {
      const segments = [person.name];
      if (person.idNumber) {
        segments.push(`${ID_TYPE_LABEL[person.idType]}: ${person.idNumber}`);
      }
      segments.push(`rođ. ${formatDay(person.birthday)}`);
      if (person.naPausalu) segments.push('na paušalu');
      return `- ${segments.join(' / ')}`;
    })
    .join('\n');
}

function formatCarsBlock(reservation: Reservation): string {
  if (reservation.cars.length === 0) return '/';
  return reservation.cars.map((car) => car.registrationPlate).join(', ');
}

/**
 * Real placeholder values for the "online reservation" notice, from one
 * family's soonest upcoming reservation (falling back to their latest past
 * one). Mirrors the server's onlineReservationEmails.ts formatting exactly,
 * so this preview matches what a real send would produce. `null` when the
 * family has no reservations — the caller falls back to samples.
 */
function buildOnlineReservationVars(
  family: { id: number; familyName: string },
  reservations: Reservation[]
): Record<string, string> | null {
  const familyReservations = reservations
    .filter((r) => r.userId === family.id)
    .sort((a, b) => a.startDay.localeCompare(b.startDay));
  if (familyReservations.length === 0) return null;

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = familyReservations.find((r) => r.startDay >= today);
  const reservation = upcoming ?? familyReservations[familyReservations.length - 1];

  return {
    familyName: family.familyName,
    startDay: formatDay(reservation.startDay),
    endDay: formatDay(reservation.endDay),
    persons: formatPersonsBlock(reservation.persons),
    cars: formatCarsBlock(reservation)
  };
}

/**
 * Real preview values for the given family under the given template type, or
 * `null` to fall back to the template's generic sample data — either
 * because no family is selected, or the family has no reservations to
 * compute real data from.
 */
function buildRealVars(
  template: EmailTemplate,
  family: { id: number; familyName: string } | null,
  reservations: Reservation[],
  breakdownsById: Map<number, ReservationBreakdownData>
): Record<string, string> | null {
  if (!family) return null;
  if (template.type === 'price_confirmation') {
    return buildPriceConfirmationVars(family, reservations, breakdownsById);
  }
  if (template.type === 'online_reservation') {
    return buildOnlineReservationVars(family, reservations);
  }
  return null;
}

type TemplateCardProps = {
  template: EmailTemplate;
  onSaved: (updated: EmailTemplate) => void;
};

function TemplateCard({ template, onSaved }: TemplateCardProps) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(template));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);

  const dirty =
    draft.subject !== template.subject ||
    draft.body !== template.body ||
    draft.recipient !== template.recipient ||
    draft.bcc !== template.bcc;

  function updateDraft<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  async function handleSave() {
    setBusy(true);
    setError(null);
    try {
      const updated = await api.updateEmailTemplate(template.type, draft);
      onSaved(updated);
      setDraft(draftFrom(updated));
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Napaka pri shranjevanju predloge.');
    } finally {
      setBusy(false);
    }
  }

  async function handleReset() {
    setBusy(true);
    setError(null);
    try {
      const updated = await api.resetEmailTemplate(template.type);
      onSaved(updated);
      setDraft(draftFrom(updated));
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Napaka pri ponastavitvi predloge.');
    } finally {
      setBusy(false);
    }
  }

  async function handleTranslate() {
    setTranslating(true);
    setError(null);
    try {
      const translated = await api.translateEmailTemplate(template.type, {
        subject: draft.subject,
        body: draft.body
      });
      setDraft((prev) => ({ ...prev, ...translated }));
      setSaved(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Prevajanje ni uspelo.');
    } finally {
      setTranslating(false);
    }
  }

  return (
    <Card as="section">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold text-brand-dark">{template.label}</h3>
        {template.isCustomized && (
          <Label color="sky" size="sm">
            prilagojeno
          </Label>
        )}
      </div>
      <p className="mb-4 text-sm text-brand/60">{template.description}</p>

      {template.placeholders.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {template.placeholders.map((placeholder) => (
            <span
              key={placeholder.key}
              title={placeholder.description}
              className="rounded-lg bg-sky/60 px-2 py-1 font-mono text-xs text-brand-dark"
            >
              {`{${placeholder.key}}`}
            </span>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {template.recipientLabel && (
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-brand-dark">
              {template.recipientLabel}
            </span>
            <input
              type="email"
              className={baseFieldClass}
              value={draft.recipient}
              placeholder="npr. recepcija@kamp.hr"
              onChange={(event) => updateDraft('recipient', event.target.value)}
            />
          </label>
        )}
        {template.recipientLabel && (
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-brand-dark">
              Skrita kopija (BCC)
            </span>
            <input
              type="text"
              className={baseFieldClass}
              value={draft.bcc}
              placeholder="npr. ana@example.com, ivan@example.com"
              onChange={(event) => updateDraft('bcc', event.target.value)}
            />
            <span className="mt-1 block text-xs text-brand/60">
              Dodatni prejemniki, ločeni z vejico.
            </span>
          </label>
        )}
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-brand-dark">Zadeva</span>
          <input
            className={baseFieldClass}
            value={draft.subject}
            onChange={(event) => updateDraft('subject', event.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-brand-dark">Besedilo</span>
          <textarea
            rows={10}
            className={`${baseFieldClass} font-mono`}
            value={draft.body}
            onChange={(event) => updateDraft('body', event.target.value)}
          />
        </label>
      </div>

      {error && <AlertBox className="mt-3">{error}</AlertBox>}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button icon={Save} disabled={!dirty || busy} onClick={handleSave}>
          {busy ? 'Shranjujem…' : 'Shrani predlogo'}
        </Button>
        {template.isCustomized && (
          <Button variant="outline" icon={RotateCcw} disabled={busy} onClick={handleReset}>
            Ponastavi na privzeto
          </Button>
        )}
        <Button variant="outline" icon={Languages} disabled={translating} onClick={handleTranslate}>
          {translating ? 'Prevajam…' : 'Prevedi v hrvaščino'}
        </Button>
        {saved && !dirty && (
          <span className="text-sm font-medium text-brand-dark">Shranjeno.</span>
        )}
      </div>
    </Card>
  );
}

type TestSendSectionProps = {
  templates: EmailTemplate[];
  familyOptions: ComboboxOption<number>[];
  families: Family[];
  reservations: Reservation[];
  breakdownsById: Map<number, ReservationBreakdownData>;
};

/**
 * Shared "send a test email" flow: pick a template, pick which family to act
 * as (drives the real-data preview), then type the actual recipient — a
 * free-text address, since a test should never depend on (or leak to) that
 * family's own inbox. Always sends the template's currently *saved* text.
 */
function TestSendSection({
  templates,
  familyOptions,
  families,
  reservations,
  breakdownsById
}: TestSendSectionProps) {
  const [templateType, setTemplateType] = useState<string>(templates[0]?.type ?? '');
  const [familyId, setFamilyId] = useState(NO_FAMILY_SELECTED);
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const templateOptions = useMemo<ComboboxOption<string>[]>(
    () => templates.map((template) => ({ value: template.type, label: template.label })),
    [templates]
  );

  const template = templates.find((t) => t.type === templateType) ?? null;
  const family = families.find((f) => f.id === familyId) ?? null;
  const realVars =
    template && family
      ? buildRealVars(template, { id: family.id, familyName: family.familyName }, reservations, breakdownsById)
      : null;
  const previewValues = realVars ?? template?.sampleValues ?? {};

  async function handleSend() {
    if (!template || familyId === NO_FAMILY_SELECTED || !to.trim()) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const sent = await api.sendTestEmail(template.type, {
        to: to.trim(),
        familyId,
        subject: template.subject,
        body: template.body,
        vars: previewValues
      });
      setResult(`Testna e-pošta poslana na ${sent.to}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pošiljanje testne e-pošte ni uspelo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card as="section">
      <h3 className="mb-1 text-base font-semibold text-brand-dark">Testno pošiljanje e-pošte</h3>
      <p className="mb-4 text-sm text-brand/60">
        Pošlje trenutno shranjeno besedilo izbrane predloge, izpolnjeno z resničnimi podatki
        izbrane družine (ali vzorčnimi, če družina nima rezervacij), na poljuben naslov.
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <span className="mb-1.5 block text-sm font-medium text-brand-dark">Predloga</span>
          <Combobox
            value={templateType}
            onChange={(value) => {
              setTemplateType(value);
              setResult(null);
              setError(null);
            }}
            options={templateOptions}
            aria-label="Predloga e-pošte"
          />
        </div>
        <div>
          <span className="mb-1.5 block text-sm font-medium text-brand-dark">Nastopa kot družina</span>
          <Combobox
            value={familyId}
            onChange={(value) => {
              setFamilyId(value);
              setResult(null);
              setError(null);
            }}
            options={familyOptions}
            placeholder="Izberi družino…"
            aria-label="Družina za testno e-pošto"
          />
        </div>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-brand-dark">
            Prejemnik testne e-pošte
          </span>
          <input
            type="email"
            className={baseFieldClass}
            value={to}
            placeholder="tvoja@e-posta.si"
            onChange={(event) => {
              setTo(event.target.value);
              setResult(null);
              setError(null);
            }}
          />
        </label>
      </div>

      <div className="mt-4">
        <Button
          icon={Send}
          disabled={!template || familyId === NO_FAMILY_SELECTED || !to.trim() || busy}
          onClick={handleSend}
        >
          {busy ? 'Pošiljam…' : 'Pošlji test'}
        </Button>
      </div>

      {result && <p className="mt-2 text-sm font-medium text-brand-dark">{result}</p>}
      {error && <AlertBox className="mt-2">{error}</AlertBox>}

      {template && (
        <div className="mt-5 rounded-xl bg-sky/40 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand/60">
            {realVars
              ? `Predogled za ${family?.familyName}`
              : family
                ? `${family.familyName} nima rezervacij — prikazani so vzorčni podatki`
                : 'Predogled z vzorčnimi podatki'}
          </p>
          <p className="mb-1 text-sm font-semibold text-brand-dark">
            {renderPreview(template.subject, previewValues)}
          </p>
          <pre className="whitespace-pre-wrap font-sans text-sm text-brand-dark/90">
            {renderPreview(template.body, previewValues)}
          </pre>
        </div>
      )}
    </Card>
  );
}

export type EmailSettingsPageProps = {
  reservations: Reservation[];
  breakdownsById: Map<number, ReservationBreakdownData>;
};

export function EmailSettingsPage({ reservations, breakdownsById }: EmailSettingsPageProps) {
  const [templates, setTemplates] = useState<EmailTemplate[] | null>(null);
  const [families, setFamilies] = useState<Family[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setError(null);
      try {
        const [{ templates: list }, { families: familyList }] = await Promise.all([
          api.getEmailTemplates(),
          api.listFamilies()
        ]);
        if (!cancelled) {
          setTemplates(list);
          setFamilies(familyList);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Napaka pri nalaganju predlog.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Every family, not just ones with an email — the test recipient is now a
  // free-text address independent of the acting family's own inbox.
  const familyOptions = useMemo<ComboboxOption<number>[]>(
    () => families.map((family) => ({ value: family.id, label: family.familyName })),
    [families]
  );

  function handleSaved(updated: EmailTemplate) {
    setTemplates((prev) => prev?.map((t) => (t.type === updated.type ? updated : t)) ?? prev);
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <div>
        <h2 className="mb-1 text-xl font-semibold text-white drop-shadow-sm">Emaili</h2>
        <p className="text-sm text-white/80 drop-shadow-sm">
          Predloge e-pošte, ki jih aplikacija samodejno pošilja. Uporabi ograde v zavitih oklepajih
          (npr. {'{familyName}'}) za podatke, ki se izpolnijo ob pošiljanju.
        </p>
      </div>

      {error && <AlertBox>{error}</AlertBox>}

      {loading ? (
        <p className="text-center text-sm text-white/80 drop-shadow-sm">Nalagam…</p>
      ) : templates && templates.length === 0 ? (
        <Card className="text-center text-sm text-brand/70">
          Aplikacija trenutno ne pošilja nobene samodejne e-pošte.
        </Card>
      ) : (
        <>
          {templates?.map((template) => (
            <TemplateCard key={template.type} template={template} onSaved={handleSaved} />
          ))}
          {templates && templates.length > 0 && (
            <TestSendSection
              templates={templates}
              familyOptions={familyOptions}
              families={families}
              reservations={reservations}
              breakdownsById={breakdownsById}
            />
          )}
        </>
      )}
    </div>
  );
}
