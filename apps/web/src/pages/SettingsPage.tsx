import { CalendarDays, Plus, Save, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '../components/ui/Button';
import { DateRangePicker, type DateRange } from '../components/ui/DateRangePicker';
import { Input } from '../components/ui/Input';
import { Label } from '../components/ui/Label';
import { Modal } from '../components/ui/Modal';
import { computePricing, formatEur, seasonLabel } from '../lib/pricing';
import type { Season, Settings } from '../lib/types';

/** Seasons recur every year, so the picker uses a fixed reference year and we
 * keep only the month/day. A leap year lets 29.02. be picked if ever needed. */
const REF_YEAR = 2024;

export type SettingsPageProps = {
  settings: Settings;
  onSave: (next: Settings) => Promise<void>;
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
        className="flex w-full items-center gap-2 whitespace-nowrap rounded-xl border border-brand/20 bg-white px-3 py-2 text-left text-sm text-brand-dark outline-none transition-colors hover:border-brand/50 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/30"
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
        <div className="flex justify-center">
          <DateRangePicker
            value={value}
            onChange={onChange}
            disablePast={false}
            defaultMonth={from ?? new Date(REF_YEAR, 0, 1)}
            numberOfMonths={2}
          />
        </div>
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

export function SettingsPage({ settings, onSave, isAdmin = false }: SettingsPageProps) {
  const readOnly = !isAdmin;
  const [pausalPrice, setPausalPrice] = useState(String(settings.pausalPrice));
  const [discount, setDiscount] = useState(String(settings.oneoffDiscountPercent));
  const [touristTax, setTouristTax] = useState(String(settings.touristTax));
  const [seasons, setSeasons] = useState<SeasonDraft[]>(settings.seasons.map(toDraft));
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPausalPrice(String(settings.pausalPrice));
    setDiscount(String(settings.oneoffDiscountPercent));
    setTouristTax(String(settings.touristTax));
    setSeasons(settings.seasons.map(toDraft));
  }, [settings]);

  const parsedPrice = Number(pausalPrice) || 0;
  const parsedDiscount = Number(discount) || 0;
  const preview = computePricing(
    { pausalPrice: parsedPrice, oneoffDiscountPercent: parsedDiscount, touristTax: 0, seasons: [] },
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
      await onSave({
        pausalPrice: parsedPrice,
        oneoffDiscountPercent: parsedDiscount,
        touristTax: parsedTax,
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
        <h2 className="mb-1 text-xl font-semibold text-white drop-shadow-sm">
          {readOnly ? 'Cenik' : 'Nastavitve'}
        </h2>
        <p className="text-sm text-white/80 drop-shadow-sm">
          {readOnly
            ? 'Letni pavšal in popust ob enkratnem plačilu, turistična taksa ter cene po sezonah za dodatne osebe, ki niso na pavšalu.'
            : 'Določi letni pavšal in popust ob enkratnem plačilu, turistično takso ter cene po sezonah za dodatne osebe, ki niso na pavšalu.'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <section className="rounded-2xl bg-white/90 p-5 shadow-sm ring-1 ring-brand/10 backdrop-blur-sm sm:p-6">
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
            </div>
          )}

          <dl
            className={
              readOnly
                ? 'grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4'
                : 'mt-5 grid gap-5 rounded-xl bg-sky/70 px-0 py-4 sm:grid-cols-3'
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
            <div>
              <dt className="text-xs uppercase tracking-wide text-brand/60">Za pokriti</dt>
              <dd className="text-base font-semibold text-brand">
                {formatEur(preview.discountedTotal)}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-2xl bg-white/90 p-5 shadow-sm ring-1 ring-brand/10 backdrop-blur-sm sm:p-6">
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
                    <div
                      key={season.id ?? `new-${index}`}
                      className="overflow-hidden rounded-xl border border-brand/10 bg-white"
                    >
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
                    </div>
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
        </section>

        {!readOnly && error && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700 ring-1 ring-red-200">
            {error}
          </p>
        )}

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
    </div>
  );
}
