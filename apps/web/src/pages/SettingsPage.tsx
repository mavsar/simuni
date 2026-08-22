import { CalendarDays, Lock, Plus, Save, Trash2, Unlock } from 'lucide-react';
import { useState } from 'react';

import { Button } from '../components/ui/Button';
import { AlertBox, Card, CardRow } from '../components/ui/Card';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { DateRangePicker, type DateRange } from '../components/ui/DateRangePicker';
import { Input } from '../components/ui/Input';
import { Label } from '../components/ui/Label';
import { Modal } from '../components/ui/Modal';
import { computePricing, formatEur, seasonLabel, type YearSettings } from '../lib/pricing';
import type { Season, Settings } from '../lib/types';

/** Seasons recur every year, so the picker uses a fixed reference year and we
 * keep only the month/day. A leap year lets 29.02. be picked if ever needed. */
const REF_YEAR = 2024;

export type SettingsPageProps = {
  /** Pricing settings for every configurable year, ascending. */
  years: YearSettings[];
  onSave: (year: number, next: Settings) => Promise<void>;
  onConfirm: (year: number) => Promise<void>;
  onUnlock: (year: number) => Promise<void>;
  /** Admins edit the pricing; regular users see a read-only "Cenik" view. */
  isAdmin?: boolean;
};

/** A season row while editing: numbers are kept as strings for free-form input. */
type SeasonDraft = {
  id?: number;
  startMonth: string;
  startDay: string;
  endMonth: string;
  endDay: string;
  priceAdult: string;
  priceAdultSenior: string;
  priceChild0_2: string;
  priceChild3_5: string;
  priceChild6_11: string;
};

function toDraft(season: Season): SeasonDraft {
  return {
    id: season.id,
    startMonth: String(season.startMonth),
    startDay: String(season.startDay),
    endMonth: String(season.endMonth),
    endDay: String(season.endDay),
    priceAdult: String(season.priceAdult),
    priceAdultSenior: String(season.priceAdultSenior),
    priceChild0_2: String(season.priceChild0_2),
    priceChild3_5: String(season.priceChild3_5),
    priceChild6_11: String(season.priceChild6_11)
  };
}

function emptyDraft(): SeasonDraft {
  return {
    startMonth: '',
    startDay: '',
    endMonth: '',
    endDay: '',
    priceAdult: '0',
    priceAdultSenior: '0',
    priceChild0_2: '0',
    priceChild3_5: '0',
    priceChild6_11: '0'
  };
}

/** Builds a reference-year Date from month/day strings, or null if incomplete. */
function refDate(month: string, day: string): Date | null {
  const m = Number(month);
  const d = Number(day);
  if (!m || !d) return null;
  return new Date(REF_YEAR, m - 1, d);
}

/** Short `d. m.` label for a month/day pair. */
function formatMonthDay(month: string, day: string): string {
  const m = Number(month);
  const d = Number(day);
  if (!m || !d) return '—';
  return `${d}. ${m}.`;
}

type SeasonPeriodPickerProps = {
  startMonth: string;
  startDay: string;
  endMonth: string;
  endDay: string;
  onChange: (range: DateRange | undefined) => void;
};

/** A button that opens a calendar to pick a season's (recurring) date range. */
function SeasonPeriodPicker({
  startMonth,
  startDay,
  endMonth,
  endDay,
  onChange
}: SeasonPeriodPickerProps) {
  const [open, setOpen] = useState(false);

  const from = refDate(startMonth, startDay) ?? undefined;
  const to = refDate(endMonth, endDay) ?? undefined;
  const value: DateRange | undefined = from ? { from, to } : undefined;
  const label =
    from || to
      ? `${formatMonthDay(startMonth, startDay)} – ${formatMonthDay(endMonth, endDay)}`
      : 'Izberi obdobje';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 whitespace-nowrap rounded-xl border border-brand/20 bg-transparent px-3 py-2 text-left text-sm text-brand-dark outline-none transition-colors hover:border-brand/50 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/30"
      >
        <CalendarDays size={15} className="shrink-0 text-brand" aria-hidden />
        <span className={from || to ? '' : 'text-brand/50'}>{label}</span>
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Obdobje sezone"
        className="max-w-2xl"
        footer={
          <Button variant="full" onClick={() => setOpen(false)}>
            Potrdi
          </Button>
        }
      >
        <p className="mb-3 text-sm text-brand/70">
          Klikni začetni in nato končni dan. Upoštevata se samo dan in mesec — obdobje velja vsako
          leto.
        </p>
        <DateRangePicker
          value={value}
          onChange={onChange}
          disablePast={false}
          defaultMonth={from ?? new Date(REF_YEAR, 0, 1)}
          numberOfMonths={2}
          formatFieldLabel={(date) => `${date.getDate()}. ${date.getMonth() + 1}.`}
        />
      </Modal>
    </>
  );
}

const PRICE_FIELDS = [
  { key: 'priceAdult', label: 'Odrasli' },
  { key: 'priceAdultSenior', label: 'Odrasli 60+' },
  { key: 'priceChild0_2', label: 'Otroci 0–2' },
  { key: 'priceChild3_5', label: 'Otroci 3–5' },
  { key: 'priceChild6_11', label: 'Otroci 6–11' }
] as const;

const EMPTY_SEASONS: Season[] = [];

export function SettingsPage({ years, onSave, onConfirm, onUnlock, isAdmin = false }: SettingsPageProps) {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const yearSettings: YearSettings =
    years.find((entry) => entry.year === year) ??
    years[years.length - 1] ?? {
      year,
      pausalPrice: 0,
      oneoffDiscountPercent: 0,
      touristTax: 0,
      accommodationFee: 0,
      touristTaxExemptAge: 0,
      pricesConfirmed: false,
      pricesConfirmedAt: null,
      stored: false,
      updatedAt: null,
      seasons: EMPTY_SEASONS,
      snapshots: []
    };

  const locked = yearSettings.pricesConfirmed;
  const readOnly = !isAdmin || locked;

  const [pausalPrice, setPausalPrice] = useState(String(yearSettings.pausalPrice));
  const [discount, setDiscount] = useState(String(yearSettings.oneoffDiscountPercent));
  const [touristTax, setTouristTax] = useState(String(yearSettings.touristTax));
  const [accommodationFee, setAccommodationFee] = useState(String(yearSettings.accommodationFee));
  const [touristTaxExemptAge, setTouristTaxExemptAge] = useState(
    String(yearSettings.touristTaxExemptAge)
  );
  const [seasons, setSeasons] = useState<SeasonDraft[]>(yearSettings.seasons.map(toDraft));
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A year the admin never edited still carries updatedAt from whichever year
  // it inherits from — so this key changes exactly when the drafts below
  // should be re-seeded from `yearSettings`: on switching years, and after a
  // save/confirm/unlock refreshes that year's (or its source year's) data.
  // Doing this at render time (rather than useEffect) avoids resetting the
  // fields on every unrelated re-render, since `yearSettings` is a fresh
  // object for any inherited year.
  const resyncKey = `${yearSettings.year}|${yearSettings.updatedAt ?? ''}|${yearSettings.pricesConfirmed}`;
  const [seededKey, setSeededKey] = useState(resyncKey);
  if (seededKey !== resyncKey) {
    setSeededKey(resyncKey);
    setPausalPrice(String(yearSettings.pausalPrice));
    setDiscount(String(yearSettings.oneoffDiscountPercent));
    setTouristTax(String(yearSettings.touristTax));
    setAccommodationFee(String(yearSettings.accommodationFee));
    setTouristTaxExemptAge(String(yearSettings.touristTaxExemptAge));
    setSeasons(yearSettings.seasons.map(toDraft));
    setError(null);
    setSavedAt(null);
  }

  const dirty =
    pausalPrice !== String(yearSettings.pausalPrice) ||
    discount !== String(yearSettings.oneoffDiscountPercent) ||
    touristTax !== String(yearSettings.touristTax) ||
    accommodationFee !== String(yearSettings.accommodationFee) ||
    touristTaxExemptAge !== String(yearSettings.touristTaxExemptAge) ||
    JSON.stringify(seasons) !== JSON.stringify(yearSettings.seasons.map(toDraft));

  // Switching years while there are unsaved edits asks for confirmation first.
  const [pendingYear, setPendingYear] = useState<number | null>(null);

  function requestYear(next: number) {
    if (next === year) return;
    if (dirty) {
      setPendingYear(next);
    } else {
      setYear(next);
    }
  }

  const [priceAction, setPriceAction] = useState<'confirm' | 'unlock' | null>(null);
  const [priceActionBusy, setPriceActionBusy] = useState(false);

  async function runPriceAction() {
    if (!priceAction) return;
    setPriceActionBusy(true);
    try {
      if (priceAction === 'confirm') await onConfirm(year);
      else await onUnlock(year);
      setPriceAction(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Napaka pri potrjevanju cen.');
      setPriceAction(null);
    } finally {
      setPriceActionBusy(false);
    }
  }

  const parsedPrice = Number(pausalPrice) || 0;
  const parsedDiscount = Number(discount) || 0;
  const preview = computePricing(
    {
      pausalPrice: parsedPrice,
      oneoffDiscountPercent: parsedDiscount,
      touristTax: 0,
      accommodationFee: 0,
      touristTaxExemptAge: 0,
      seasons: []
    },
    0
  );

  // The most expensive adult season is the discount baseline (0 %).
  const maxAdult = seasons.reduce((max, season) => Math.max(max, Number(season.priceAdult) || 0), 0);

  function updateSeason(index: number, field: keyof SeasonDraft, value: string) {
    setSeasons((prev) =>
      prev.map((season, i) => (i === index ? { ...season, [field]: value } : season))
    );
  }

  function setSeasonRange(index: number, range: DateRange | undefined) {
    const from = range?.from;
    const to = range?.to ?? range?.from;
    setSeasons((prev) =>
      prev.map((season, i) =>
        i === index
          ? {
              ...season,
              startMonth: from ? String(from.getMonth() + 1) : '',
              startDay: from ? String(from.getDate()) : '',
              endMonth: to ? String(to.getMonth() + 1) : '',
              endDay: to ? String(to.getDate()) : ''
            }
          : season
      )
    );
  }

  function addSeason() {
    setSeasons((prev) => [...prev, emptyDraft()]);
  }

  function removeSeason(index: number) {
    setSeasons((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (parsedDiscount < 0 || parsedDiscount > 100) {
      setError('Popust mora biti med 0 in 100 %.');
      return;
    }
    if (parsedPrice < 0) {
      setError('Cena ne sme biti negativna.');
      return;
    }
    const parsedTax = Number(touristTax) || 0;
    if (parsedTax < 0) {
      setError('Turistična taksa ne sme biti negativna.');
      return;
    }
    const parsedAccommodationFee = Number(accommodationFee) || 0;
    if (parsedAccommodationFee < 0) {
      setError('Enkratno plačilo nastanitve ne sme biti negativno.');
      return;
    }
    const parsedTouristTaxExemptAge = Math.trunc(Number(touristTaxExemptAge) || 0);
    if (parsedTouristTaxExemptAge < 0) {
      setError('Starost, opravičena plačila turistične takse, ne sme biti negativna.');
      return;
    }

    const seasonsPayload: Season[] = seasons.map((season) => {
      const startMonth = Number(season.startMonth) || 0;
      const startDay = Number(season.startDay) || 0;
      const endMonth = Number(season.endMonth) || 0;
      const endDay = Number(season.endDay) || 0;
      return {
        ...(season.id !== undefined ? { id: season.id } : {}),
        name: seasonLabel({ startMonth, startDay, endMonth, endDay }),
        startMonth,
        startDay,
        endMonth,
        endDay,
        priceAdult: Number(season.priceAdult) || 0,
        priceAdultSenior: Number(season.priceAdultSenior) || 0,
        priceChild0_2: Number(season.priceChild0_2) || 0,
        priceChild3_5: Number(season.priceChild3_5) || 0,
        priceChild6_11: Number(season.priceChild6_11) || 0
      };
    });

    for (const season of seasonsPayload) {
      const validMonth = (m: number) => m >= 1 && m <= 12;
      const validDay = (d: number) => d >= 1 && d <= 31;
      if (
        !validMonth(season.startMonth) ||
        !validMonth(season.endMonth) ||
        !validDay(season.startDay) ||
        !validDay(season.endDay)
      ) {
        setError('Vsaka sezona potrebuje veljaven začetni in končni datum (dan 1–31, mesec 1–12).');
        return;
      }
    }

    setSaving(true);
    try {
      await onSave(year, {
        pausalPrice: parsedPrice,
        oneoffDiscountPercent: parsedDiscount,
        touristTax: parsedTax,
        accommodationFee: parsedAccommodationFee,
        touristTaxExemptAge: parsedTouristTaxExemptAge,
        seasons: seasonsPayload
      });
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Napaka pri shranjevanju.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <div>
        <h2 className="mb-1 flex items-center gap-2 text-xl font-semibold text-white drop-shadow-sm">
          {isAdmin ? 'Nastavitve' : 'Cenik'}
          {locked && (
            <Label color="green" size="sm">
              Cene potrjene
            </Label>
          )}
        </h2>
        <p className="text-sm text-white/80 drop-shadow-sm">
          {readOnly
            ? 'Letni pavšal in popust ob enkratnem plačilu, turistična taksa (z oprostitvijo za mlajše otroke), enkratno plačilo nastanitve ter cene po sezonah za dodatne osebe, ki niso na pavšalu.'
            : 'Določi letni pavšal in popust ob enkratnem plačilu, turistično takso (z oprostitvijo za mlajše otroke), enkratno plačilo nastanitve ter cene po sezonah za dodatne osebe, ki niso na pavšalu.'}
        </p>
      </div>

      {years.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-white/70">Leto</span>
          {years.map((entry) => (
            <button
              key={entry.year}
              type="button"
              onClick={() => requestYear(entry.year)}
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium backdrop-blur-sm transition-colors ${
                entry.year === year
                  ? 'bg-white text-brand'
                  : 'bg-white/15 text-white hover:bg-white/25'
              }`}
            >
              {entry.year}
              {entry.pricesConfirmed && <Lock size={11} aria-hidden />}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Card as="section">
          <h3 className="mb-4 text-base font-semibold text-brand-dark">Pavšal</h3>
          {!readOnly && (
            <div className="grid gap-5 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-brand-dark">
                  Letni pavšal (€)
                </span>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={pausalPrice}
                  onChange={(event) => setPausalPrice(event.target.value)}
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-brand-dark">
                  Popust ob enkratnem plačilu (%)
                </span>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="0.1"
                  inputMode="decimal"
                  value={discount}
                  onChange={(event) => setDiscount(event.target.value)}
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-brand-dark">
                  Turistična taksa (€ / oseba / noč)
                </span>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={touristTax}
                  onChange={(event) => setTouristTax(event.target.value)}
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-brand-dark">
                  Otroci oproščeni takse do starosti (let)
                </span>
                <Input
                  type="number"
                  min={0}
                  step="1"
                  inputMode="numeric"
                  value={touristTaxExemptAge}
                  onChange={(event) => setTouristTaxExemptAge(event.target.value)}
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-brand-dark">
                  Enkratno plačilo nastanitve (€ / oseba)
                </span>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={accommodationFee}
                  onChange={(event) => setAccommodationFee(event.target.value)}
                />
              </label>
            </div>
          )}

          <dl
            className={
              readOnly
                ? 'grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4'
                : 'mt-5 grid gap-5 rounded-xl px-0 py-4 sm:grid-cols-3'
            }
          >
            <div>
              <dt className="text-xs uppercase tracking-wide text-brand/60">Pavšal</dt>
              <dd className="text-base font-semibold text-brand-dark">{formatEur(parsedPrice)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-brand/60">
                {readOnly ? `${parsedDiscount}% popust ob enkratnem plačilu` : 'Popust'}
              </dt>
              <dd className="text-base font-semibold text-brand-dark">
                −{formatEur(preview.discountAmount)}
              </dd>
            </div>
            {readOnly && (
              <div>
                <dt className="text-xs uppercase tracking-wide text-brand/60">Turistična taksa</dt>
                <dd className="text-base font-semibold text-brand-dark">
                  {formatEur(Number(touristTax) || 0)}
                </dd>
              </div>
            )}
            {readOnly && (
              <div>
                <dt className="text-xs uppercase tracking-wide text-brand/60">
                  Oprostitev takse do starosti
                </dt>
                <dd className="text-base font-semibold text-brand-dark">
                  {Number(touristTaxExemptAge) || 0} let
                </dd>
              </div>
            )}
            {readOnly && (
              <div>
                <dt className="text-xs uppercase tracking-wide text-brand/60">
                  Enkratno plačilo nastanitve
                </dt>
                <dd className="text-base font-semibold text-brand-dark">
                  {formatEur(Number(accommodationFee) || 0)}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-xs uppercase tracking-wide text-brand/60">Za pokriti</dt>
              <dd className="text-base font-semibold text-brand">
                {formatEur(preview.discountedTotal)}
              </dd>
            </div>
          </dl>
        </Card>

        <Card as="section">
          <div className="mb-1 flex items-center justify-between gap-3">
            <h3 className="text-base font-semibold text-brand-dark">Cene po sezonah</h3>
            {!readOnly && (
              <Button type="button" variant="outline" size="sm" icon={Plus} onClick={addSeason}>
                Dodaj sezono
              </Button>
            )}
          </div>
          <p className="mb-4 text-sm text-brand/60">
            Cena na osebo na noč za osebe, ki niso na pavšalu. Datumi se ponavljajo vsako leto.
          </p>

          {seasons.length === 0 ? (
            <p className="text-sm text-brand-dark">
              Ni definiranih sezon. Klikni „Dodaj sezono“, da ustvariš novo.
            </p>
          ) : (
            <>
              {/* ── Mobile card list — read-only only (< sm) ──────────── */}
              {readOnly && (
                <div className="space-y-2 sm:hidden">
                  {seasons.map((season, index) => (
                    <CardRow key={season.id ?? `new-${index}`}>
                      <div className="flex items-center justify-between px-3 py-2.5">
                        <span className="font-medium text-brand-dark">
                          {`${formatMonthDay(season.startMonth, season.startDay)} – ${formatMonthDay(season.endMonth, season.endDay)}`}
                        </span>
                        <Label color="orange" size="lg">
                          {maxAdult > 0
                            ? `${((1 - (Number(season.priceAdult) || 0) / maxAdult) * 100).toFixed(0)} %`
                            : '—'}
                        </Label>
                      </div>
                      <div className="grid grid-cols-3 divide-x divide-brand/10 border-t border-brand/10">
                        {PRICE_FIELDS.map((field) => (
                          <div key={field.key} className="px-3 py-2">
                            <p className="text-[10px] uppercase tracking-wide text-brand/50">
                              {field.label}
                            </p>
                            <p className="text-sm font-medium text-brand-dark">
                              {formatEur(Number(season[field.key]) || 0)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </CardRow>
                  ))}
                </div>
              )}

              {/* ── Table — admin always; read-only on sm+ ───────────────── */}
              <div className={readOnly ? 'hidden overflow-x-auto sm:block' : 'overflow-x-auto'}>
                <table className="w-full border-separate border-spacing-y-1 text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-brand/60">
                      <th className="pl-0 pr-2 pb-1 font-medium">Obdobje</th>
                      {PRICE_FIELDS.map((field) => (
                        <th key={field.key} className="px-2 pb-1 font-medium">
                          {field.label}
                        </th>
                      ))}
                      <th className="px-2 pb-1 font-medium">Popust bungalov</th>
                      {!readOnly && <th className="px-2 pb-1" />}
                    </tr>
                  </thead>
                  <tbody>
                    {seasons.map((season, index) => (
                      <tr key={season.id ?? `new-${index}`}>
                        <td className="pl-0 pr-2 align-top">
                          {readOnly ? (
                            <div className="flex h-[38px] items-center whitespace-nowrap text-sm font-medium text-brand-dark">
                              {`${formatMonthDay(season.startMonth, season.startDay)} – ${formatMonthDay(
                                season.endMonth,
                                season.endDay
                              )}`}
                            </div>
                          ) : (
                            <SeasonPeriodPicker
                              startMonth={season.startMonth}
                              startDay={season.startDay}
                              endMonth={season.endMonth}
                              endDay={season.endDay}
                              onChange={(range) => setSeasonRange(index, range)}
                            />
                          )}
                        </td>
                        {PRICE_FIELDS.map((field) => (
                          <td key={field.key} className="px-2 align-top">
                            {readOnly ? (
                              <div className="flex h-[38px] items-center whitespace-nowrap text-sm text-brand-dark">
                                {formatEur(Number(season[field.key]) || 0)}
                              </div>
                            ) : (
                              <Input
                                aria-label={field.label}
                                type="number"
                                min={0}
                                step="0.01"
                                inputMode="decimal"
                                value={season[field.key]}
                                onChange={(event) =>
                                  updateSeason(index, field.key, event.target.value)
                                }
                                className="w-20 px-2"
                              />
                            )}
                          </td>
                        ))}
                        <td className="px-2 align-center">
                          <Label color="orange" size="lg">
                            {maxAdult > 0
                              ? `${((1 - (Number(season.priceAdult) || 0) / maxAdult) * 100).toFixed(0)} %`
                              : '—'}
                          </Label>
                        </td>
                        {!readOnly && (
                          <td className="px-2 align-top">
                            <Button
                              type="button"
                              variant="transparent"
                              color="danger"
                              size="iconSm"
                              icon={Trash2}
                              aria-label="Odstrani sezono"
                              title="Odstrani sezono"
                              onClick={() => removeSeason(index)}
                            />
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>

        {isAdmin && (
          <Card as="section">
            <h3 className="mb-1 text-base font-semibold text-brand-dark">Potrditev cen</h3>
            <p className="mb-4 text-sm text-brand/60">
              {locked
                ? `Cene za leto ${year} so potrjene in zaklenjene. Rezervacije tega leta ne prikazujejo več oznake „se lahko spremeni“.`
                : `Dokler cene za leto ${year} niso potrjene, se zneski pri rezervacijah tega leta še spreminjajo.`}
            </p>
            {!locked && !yearSettings.stored && (
              <AlertBox variant="info" className="mb-3">
                Vrednosti za leto {year} so prevzete iz prejšnjega leta. Ob potrditvi se shranijo
                takšne, kot so prikazane.
              </AlertBox>
            )}
            <Button
              type="button"
              variant={locked ? 'outline' : 'full'}
              color={locked ? 'danger' : 'brand'}
              icon={locked ? Unlock : Lock}
              disabled={dirty && !locked}
              onClick={() => setPriceAction(locked ? 'unlock' : 'confirm')}
            >
              {locked ? 'Odkleni cene' : 'Potrdi cene'}
            </Button>
            {dirty && !locked && (
              <p className="mt-2 text-xs text-brand/60">
                Najprej shrani spremembe, preden potrdiš cene za to leto.
              </p>
            )}
          </Card>
        )}

        {!readOnly && error && <AlertBox>{error}</AlertBox>}

        {!readOnly && (
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={saving} icon={Save}>
              {saving ? 'Shranjujem…' : 'Shrani nastavitve'}
            </Button>
            {savedAt && !saving && (
              <span className="text-sm font-medium text-white drop-shadow-sm">Shranjeno.</span>
            )}
          </div>
        )}
      </form>

      <ConfirmModal
        open={pendingYear !== null}
        title="Neshranjene spremembe"
        busy={false}
        onConfirm={() => {
          if (pendingYear !== null) setYear(pendingYear);
          setPendingYear(null);
        }}
        onCancel={() => setPendingYear(null)}
        confirmLabel="Nadaljuj"
      >
        Neshranjene spremembe za leto {year} bodo izgubljene. Nadaljujem?
      </ConfirmModal>

      <ConfirmModal
        open={priceAction !== null}
        title={priceAction === 'confirm' ? `Potrdi cene za ${year}?` : `Odkleni cene za ${year}?`}
        destructive={priceAction === 'unlock'}
        busy={priceActionBusy}
        confirmLabel={priceAction === 'confirm' ? 'Potrdi cene' : 'Odkleni'}
        onConfirm={runPriceAction}
        onCancel={() => setPriceAction(null)}
      >
        {priceAction === 'confirm'
          ? `Cene za leto ${year} bodo zaklenjene in jih ne bo več mogoče urejati, dokler jih ne odkleneš. Oznaka „se lahko spremeni“ pri rezervacijah tega leta bo izginila.`
          : `Cene za leto ${year} bodo znova urejljive. Zneski pri rezervacijah tega leta se lahko spremenijo.`}
      </ConfirmModal>
    </div>
  );
}
