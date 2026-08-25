import {
  Baby,
  Car as CarIcon,
  ChevronDown,
  ChevronRight,
  History,
  Home,
  Pencil,
  Plus,
  Trash2,
  User as UserIcon,
} from 'lucide-react';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { useMatch, useNavigate, useSearchParams } from 'react-router-dom';

import { Calendar } from '../components/Calendar';
import { Button } from '../components/ui/Button';
import { AlertBox, Card, CardRow, CardSection } from '../components/ui/Card';
import { Checkbox } from '../components/ui/Checkbox';
import { Combobox, type ComboboxOption } from '../components/ui/Combobox';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { DateRangePicker, type DateRange } from '../components/ui/DateRangePicker';
import { Label } from '../components/ui/Label';
import { Modal } from '../components/ui/Modal';
import { Radio } from '../components/ui/Radio';
import { Tooltip } from '../components/ui/Tooltip';
import { api } from '../lib/api';
import {
  computeAge,
  eachNightKeyInRange,
  formatDateTime,
  formatDayRange,
  isChild,
  nightCountInRange,
  nightCountLabel,
  parseDayKey,
  toDayKey,
} from '../lib/dates';
import {
  accommodationFeeTotal,
  ageBand,
  buildReservationBreakdowns,
  computeBungalovPricingByYear,
  dayWeight,
  formatEur,
  seasonDiscountPercent,
  seasonForDay,
  seasonLabel,
  seasonPriceForBand,
  touristTaxPayerCount,
  yearOfDay,
  type AgeBand,
  type ReservationBreakdownData,
  type YearSettingsLookup,
} from '../lib/pricing';
import type {
  Car,
  CheckinMode,
  Family,
  Person,
  Reservation,
  ReservationHistoryEntry,
  ReservationRangeInput,
  Season,
} from '../lib/types';
import { slugify } from '../lib/utils';
import { useAuth } from '../state/AuthContext';

/** Family name + date range — a friendly, human-readable stand-in for a reservation id. */
function reservationSlug(
  reservation: Pick<Reservation, 'ownerName' | 'startDay' | 'endDay'>,
): string {
  return `${slugify(reservation.ownerName)}-${reservation.startDay}-${reservation.endDay}`;
}

const BAND_LABEL: Record<AgeBand, string> = {
  child0_2: 'Otrok 0–2',
  child3_5: 'Otrok 3–5',
  child6_11: 'Otrok 6–11',
  adult: 'Odrasli',
  adultSenior: 'Odrasli 60+',
};

type EstimatePersonRow = {
  personId: number;
  name: string;
  band: AgeBand;
  nightlyPrice: number;
  nights: number;
  total: number;
};

type EstimateSeasonGroup = {
  seasonName: string | null;
  days: number;
  discountPercent: number;
  bungalovTotal: number;
  avgFams: number;
  personRows: EstimatePersonRow[];
  taxTotal: number;
};

type SelectionEstimate = {
  label: string;
  selectedDays: number;
  overlappingFamilies: Array<{ name: string; days: number }>;
  seasonGroups: EstimateSeasonGroup[];
  bungalovPausal: number;
  bungalovDiscountPercent: number;
  bungalovDiscountAmount: number;
  bungalovDiscountedTotal: number;
  simuniPersons: number;
  simuniTax: number;
  /** How many selected attendees are old enough to owe tourist tax. */
  touristTaxPayers: number;
  /** Tourist tax rate for the selection's (check-in) year. */
  touristTaxRate: number;
  /** Age below which an attendee is exempt from tourist tax, for that year. */
  touristTaxExemptAge: number;
  accommodationFee: number;
  /** One-time accommodation payment rate per attendee, for that year. */
  accommodationFeeRate: number;
  simuni: number;
  bungalov: number;
  total: number;
};

/** Short `d. m.` label for a `YYYY-MM-DD` key. */
function shortDay(dayKey: string): string {
  const [, month, day] = dayKey.split('-').map(Number);
  return `${day}. ${month}.`;
}

// The online-reservation notice's fixed daily send time — keep in sync with
// apps/server/src/index.ts's ONLINE_RESERVATION_CHECK_HOUR/MINUTE, since this
// is exactly the time the "Online prijava" tooltip promises families.
const ONLINE_CHECKIN_CHECK_HOUR = 9;
const ONLINE_CHECKIN_CHECK_MINUTE = 0;

/** When the automated notice for this reservation is due to go out, e.g. `18. 7. 2026 ob 09:00`. */
function onlineCheckinSendLabel(startDay: string): string {
  const sendDate = parseDayKey(startDay);
  sendDate.setDate(sendDate.getDate() - 7);
  const hh = String(ONLINE_CHECKIN_CHECK_HOUR).padStart(2, '0');
  const mm = String(ONLINE_CHECKIN_CHECK_MINUTE).padStart(2, '0');
  return `${sendDate.getDate()}. ${sendDate.getMonth() + 1}. ${sendDate.getFullYear()} ob ${hh}:${mm}`;
}

/** Human-readable line(s) describing what one history entry changed. */
function describeHistoryChanges(entry: ReservationHistoryEntry): string[] {
  switch (entry.action) {
    case 'created': {
      const c = entry.changes;
      const lines = [
        `Ustvaril rezervacijo ${formatDayRange(c.startDay, c.endDay)} za družino ${c.ownerName}.`,
      ];
      if (c.persons.length > 0) lines.push(`Osebe: ${c.persons.join(', ')}.`);
      if (c.cars.length > 0) lines.push(`Avtomobili: ${c.cars.join(', ')}.`);
      return lines;
    }
    case 'updated': {
      const c = entry.changes;
      const lines: string[] = [];
      if (c.period) {
        lines.push(
          `Spremenil obdobje: ${formatDayRange(c.period.from.startDay, c.period.from.endDay)} → ${formatDayRange(c.period.to.startDay, c.period.to.endDay)}.`,
        );
      }
      if (c.owner) {
        lines.push(`Spremenil družino: ${c.owner.from} → ${c.owner.to}.`);
      }
      if (c.persons) {
        if (c.persons.added.length > 0) lines.push(`Dodal osebe: ${c.persons.added.join(', ')}.`);
        if (c.persons.removed.length > 0) {
          lines.push(`Odstranil osebe: ${c.persons.removed.join(', ')}.`);
        }
      }
      if (c.cars) {
        if (c.cars.added.length > 0) lines.push(`Dodal avtomobile: ${c.cars.added.join(', ')}.`);
        if (c.cars.removed.length > 0) {
          lines.push(`Odstranil avtomobile: ${c.cars.removed.join(', ')}.`);
        }
      }
      return lines.length > 0 ? lines : ['Shranil rezervacijo brez sprememb.'];
    }
    case 'payment': {
      const { from, to } = entry.changes.bungalovPaid;
      return [`Bungalov: ${from ? 'plačan' : 'ni plačan'} → ${to ? 'plačan' : 'ni plačan'}.`];
    }
    case 'email_sent': {
      return [`Poslana e-pošta z online rezervacijo na ${entry.changes.recipient}.`];
    }
    default:
      return [];
  }
}

export type AvailabilityPageProps = {
  settingsForYear: YearSettingsLookup;
  reservations: Reservation[];
  occupiedDays: Set<string>;
  currentUserId: number;
  /** Admins see and can edit every reservation, regardless of owner. */
  isAdmin?: boolean;
  /** Payment-excluded families never see a bungalov amount, anywhere. */
  hideBungalov?: boolean;
  onCreateReservation: (input: ReservationRangeInput) => Promise<void>;
  onUpdateReservation: (id: number, input: ReservationRangeInput) => Promise<void>;
  onDeleteReservation: (id: number) => Promise<void>;
  onUpdateReservationPayment: (id: number, bungalovPaid: boolean) => Promise<void>;
  /** Refetches reservations — used to clear a reservation's unseen-history badge after viewing it. */
  onRefreshReservations: () => Promise<void>;
};

/** Counts attendees split into adults and children by age. */
function splitAttendees(persons: Person[]): { adults: number; children: number } {
  let adults = 0;
  let children = 0;
  for (const person of persons) {
    if (isChild(person.birthday)) children += 1;
    else adults += 1;
  }
  return { adults, children };
}

function AttendeeCounts({ persons }: { persons: Person[] }) {
  const { adults, children } = splitAttendees(persons);
  if (adults === 0 && children === 0) {
    return <span className="text-brand/40">brez oseb</span>;
  }
  const names = (
    <ul className="space-y-0.5">
      {persons.map((person) => (
        <li key={person.id} className="flex items-center gap-1.5">
          {isChild(person.birthday) ? (
            <Baby size={12} aria-hidden />
          ) : (
            <UserIcon size={12} aria-hidden />
          )}
          <span>{person.name}</span>
        </li>
      ))}
    </ul>
  );
  return (
    <Tooltip content={names}>
      <span className="inline-flex cursor-default items-center gap-2">
        {adults > 0 && (
          <span className="inline-flex items-center gap-0.5">
            <UserIcon size={13} aria-hidden /> {adults}
          </span>
        )}
        {children > 0 && (
          <span className="inline-flex items-center gap-0.5">
            <Baby size={13} aria-hidden /> {children}
          </span>
        )}
      </span>
    </Tooltip>
  );
}

/**
 * Shown next to the date range for a reservation that opted into the
 * automated online-reservation notice. Turns green once that notice has
 * actually gone out; until then, hovering explains exactly when it will.
 */
function OnlineCheckinLabel({ reservation }: { reservation: Reservation }) {
  if (reservation.checkinMode !== 'online') return null;
  if (reservation.onlineCheckinEmailSent) {
    return (
      <Label color="green" size="sm">
        Online prijava potrjena
      </Label>
    );
  }
  return (
    <Tooltip
      content={`E-pošta za online prijavo bo poslana recepciji Šimuni ${onlineCheckinSendLabel(reservation.startDay)}.`}
    >
      <span>
        <Label color="sand" size="sm">
          Online prijava
        </Label>
      </span>
    </Tooltip>
  );
}

/**
 * The reservation table's "Plačilo" column. While a year's prices are still
 * open the bungalov amount can still move, so payment status isn't shown yet
 * — only once prices are locked does whether it was actually paid become a
 * fact worth displaying.
 */
function PaymentColumnLabel({
  priceMayChange,
  bungalovPaid,
  year,
}: {
  priceMayChange: boolean;
  bungalovPaid: boolean;
  year: number;
}) {
  if (priceMayChange) {
    return (
      <Tooltip content={`Cene za leto ${year} še niso potrjene — znesek se lahko še spremeni.`}>
        <p className="w-fit cursor-default text-xs text-brand/60">Cena se lahko še spremeni</p>
      </Tooltip>
    );
  }
  return (
    <Label color={bungalovPaid ? 'green' : 'red'} size="sm">
      {bungalovPaid ? 'Plačano' : 'Ni plačano'}
    </Label>
  );
}

/**
 * Opens the reservation's history modal — only rendered when there's history
 * to show. The red counter is how many entries haven't been viewed yet
 * (server-tracked; clears once the history modal is actually opened).
 */
function HistoryButton({
  reservation,
  onClick,
}: {
  reservation: Reservation;
  onClick: () => void;
}) {
  if (reservation.historyCount === 0) return null;
  return (
    <div className="relative shrink-0">
      <Button
        variant="transparent"
        color="brand"
        size="iconSm"
        icon={History}
        aria-label="Zgodovina rezervacije"
        title="Zgodovina rezervacije"
        onClick={onClick}
        className="rounded-full text-brand"
      />
      {reservation.unseenHistoryCount > 0 && (
        <span
          aria-hidden
          className="pointer-events-none absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white"
        >
          {reservation.unseenHistoryCount}
        </span>
      )}
    </div>
  );
}

/** Expanded detail panel explaining how a reservation's prices are derived. */
function ReservationBreakdown({
  breakdown,
  hideBungalov = false,
}: {
  breakdown: ReservationBreakdownData;
  hideBungalov?: boolean;
}) {
  const {
    attendees,
    days,
    simuniPersons,
    simuniTax,
    accommodationFee,
    simuni,
    bungalov,
    total,
    accommodationFeeRate,
    touristTaxExemptAge,
  } = breakdown;
  const nonPausal = attendees.filter((a) => !a.person.naPausalu);
  const pausal = attendees.filter((a) => a.person.naPausalu);

  return (
    <CardSection className="space-y-4 py-4 text-xs text-brand-dark">
      <div>
        <p className="mb-1.5 font-semibold uppercase tracking-wide text-brand/60">Osebe</p>
        <div className="flex flex-wrap gap-1.5">
          {attendees.map(({ person, band, taxExempt }) => (
            <span
              key={person.id}
              className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 ring-1 ring-brand/10"
            >
              <span className="font-medium">{person.name}</span>
              <span className="text-brand/50">{BAND_LABEL[band]}</span>
              {person.naPausalu && (
                <Label color="brand" size="sm">
                  pavšal
                </Label>
              )}
              {taxExempt && (
                <Label color="green" size="sm">
                  brez takse
                </Label>
              )}
            </span>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-left">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-brand/60">
              <th className="pb-1 pr-3 font-medium">Dan</th>
              <th className="pb-1 pr-3 font-medium">Sezona</th>
              <th className="pb-1 pr-3 text-right font-medium">Osebe</th>
              <th className="pb-1 pr-3 text-right font-medium">Taksa</th>
              <th className="pb-1 pr-3 text-right font-medium">Popust</th>
              {!hideBungalov && (
                <>
                  <th className="pb-1 pr-3 text-right font-medium">Družin</th>
                  <th className="pb-1 text-right font-medium">Bungalov</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="text-brand-dark/90">
            {days.map((d) => (
              <tr key={d.day} className="border-t border-brand/10">
                <td className="whitespace-nowrap py-1 pr-3 font-medium">{shortDay(d.day)}</td>
                <td className="whitespace-nowrap py-1 pr-3 text-brand/70">{d.seasonName ?? '—'}</td>
                <td className="whitespace-nowrap py-1 pr-3 text-right">
                  {formatEur(d.personsCost)}
                </td>
                <td className="whitespace-nowrap py-1 pr-3 text-right">
                  {d.taxPayers > 0 && (
                    <span className="text-brand/50">
                      ({d.taxPayers} × {formatEur(d.taxRate)}){' '}
                    </span>
                  )}
                  {formatEur(d.taxCost)}
                </td>
                <td className="whitespace-nowrap py-1 pr-3 text-right text-brand/70">
                  {d.discountPercent.toFixed(0)} %
                </td>
                {!hideBungalov && (
                  <>
                    <td className="whitespace-nowrap py-1 pr-3 text-right text-brand/70">
                      {d.fams}×
                    </td>
                    <td className="whitespace-nowrap py-1 text-right font-medium">
                      {formatEur(d.bungalovCost)}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <dl className={`grid gap-2 ${hideBungalov ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
        <div className="rounded-xl bg-white p-2.5 ring-1 ring-brand/10">
          <dt className="text-[10px] uppercase tracking-wide text-brand/60">Za plačati Šimuni</dt>
          <dd className="font-semibold">{formatEur(simuni)}</dd>
          <p className="mt-0.5 text-[11px] text-brand/60">
            Osebe {formatEur(simuniPersons)} + taksa {formatEur(simuniTax)}
            {(days[0]?.taxRate ?? 0) > 0 && ` (${formatEur(days[0]?.taxRate ?? 0)}/osebo/noč)`} +
            nastanitev {formatEur(accommodationFee)}
            {accommodationFeeRate > 0 && ` (${formatEur(accommodationFeeRate)}/osebo)`}
          </p>
        </div>
        {!hideBungalov && (
          <div className="rounded-xl bg-white p-2.5 ring-1 ring-brand/10">
            <dt className="text-[10px] uppercase tracking-wide text-brand/60">
              Za plačati bungalov
            </dt>
            <dd className="font-semibold">{formatEur(bungalov)}</dd>
            <p className="mt-0.5 text-[11px] text-brand/60">
              Sezonsko utežena najemnina, deljena med družine.
            </p>
          </div>
        )}
        <div className="rounded-xl bg-white p-2.5 ring-1 ring-brand/10">
          <dt className="text-[10px] uppercase tracking-wide text-brand/60">Skupaj</dt>
          <dd className="font-semibold text-brand">{formatEur(hideBungalov ? simuni : total)}</dd>
        </div>
      </dl>

      {(nonPausal.length === 0 || pausal.length > 0) && (
        <p className="text-[11px] text-brand/60">
          Cena na osebo se zaračuna le osebam, ki niso na pavšalu
          {nonPausal.length === 0 ? ' (na tej rezervaciji jih ni)' : ''}. Turistična taksa velja za
          vse prisotne, starejše od {touristTaxExemptAge} let. Enkratno plačilo nastanitve velja za
          vse prisotne.
        </p>
      )}
    </CardSection>
  );
}

/**
 * Admin-only control for whether the bungalov payment has been settled —
 * lives in the edit modal, so only ever rendered for admins.
 */
function BungalovPaidToggle({
  reservation,
  onUpdate,
}: {
  reservation: Reservation;
  onUpdate: (bungalovPaid: boolean) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);

  async function toggle() {
    setSaving(true);
    try {
      await onUpdate(!reservation.bungalovPaid);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Checkbox
      checked={reservation.bungalovPaid}
      onChange={toggle}
      disabled={saving}
      label="Bungalov plačan"
      labelClassName="w-fit text-xs"
    />
  );
}

export function AvailabilityPage({
  settingsForYear,
  reservations,
  occupiedDays,
  currentUserId,
  isAdmin = false,
  hideBungalov = false,
  onCreateReservation,
  onUpdateReservation,
  onDeleteReservation,
  onUpdateReservationPayment,
  onRefreshReservations,
}: AvailabilityPageProps) {
  const { user } = useAuth();
  const bungalovPricing = useMemo(
    () => computeBungalovPricingByYear(settingsForYear, occupiedDays),
    [settingsForYear, occupiedDays],
  );

  const navigate = useNavigate();
  // The modal's own state lives in the URL, so it's bookmarkable and the
  // browser back button closes it: /nova-rezervacija for a new booking,
  // /rezervacija/:slug (family name + date range, not a raw id) to edit one.
  const createMatch = useMatch('/razpolozljivost/nova-rezervacija');
  const editMatch = useMatch('/razpolozljivost/rezervacija/:slug');
  const editSlug = editMatch?.params.slug ?? null;
  const modalOpen = createMatch !== null || editSlug !== null;
  // Always the live server copy — there's no separate snapshot to go stale,
  // e.g. right after toggling "Bungalov plačan".
  const editing =
    editSlug !== null ? (reservations.find((r) => reservationSlug(r) === editSlug) ?? null) : null;

  // A URL naming a reservation that doesn't exist (deleted, wrong slug) or
  // that this non-admin family doesn't own bounces back to the plain tab.
  useEffect(() => {
    if (editSlug === null) return;
    if (!editing || (!isAdmin && editing.userId !== currentUserId)) {
      navigate('/razpolozljivost', { replace: true });
    }
  }, [editSlug, editing, isAdmin, currentUserId, navigate]);

  // The year/family filter chips live in the query string too, so a filtered
  // view is a link you can share or bookmark: ?leto=vse|<year>&druzina=<slug>.
  // No `leto` defaults to the current year; no `druzina` means every family.
  const [searchParams, setSearchParams] = useSearchParams();
  const yearParam = searchParams.get('leto');
  const filterYear =
    yearParam === 'vse' ? null : yearParam ? Number(yearParam) : new Date().getFullYear();
  const familyParam = searchParams.get('druzina');

  function selectYearFilter(year: number | null) {
    setSearchParams((prev: URLSearchParams) => {
      const next = new URLSearchParams(prev);
      next.set('leto', year === null ? 'vse' : String(year));
      return next;
    });
  }

  function selectFamilyFilter(name: string | null) {
    setSearchParams((prev: URLSearchParams) => {
      const next = new URLSearchParams(prev);
      if (name === null) next.delete('druzina');
      else next.set('druzina', slugify(name));
      return next;
    });
  }

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [range, setRange] = useState<DateRange | undefined>(undefined);
  const [checkinMode, setCheckinMode] = useState<CheckinMode>('manual');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Admin-only audit trail, shown in its own modal (separate from the edit
  // modal), opened via the History button on a reservation row.
  const [historyReservationId, setHistoryReservationId] = useState<number | null>(null);
  // Which "email_sent" entry currently has its "Show email" preview open.
  const [expandedHistoryEntryId, setExpandedHistoryEntryId] = useState<number | null>(null);
  const [history, setHistory] = useState<ReservationHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    if (historyReservationId === null) {
      setHistory([]);
      return;
    }
    let cancelled = false;
    setHistoryLoading(true);
    setHistoryError(null);
    api
      .getReservationHistory(historyReservationId)
      .then((res) => {
        if (!cancelled) {
          setHistory(res.history);
          // The server marks it viewed as a side effect of this request —
          // refresh so this row's unseen badge clears.
          void onRefreshReservations();
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setHistoryError(err instanceof Error ? err.message : 'Napaka pri nalaganju zgodovine.');
        }
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [historyReservationId, onRefreshReservations]);

  const historyReservation =
    historyReservationId !== null
      ? (reservations.find((r) => r.id === historyReservationId) ?? null)
      : null;

  function openHistory(reservation: Reservation) {
    setHistoryReservationId(reservation.id);
    setExpandedHistoryEntryId(null);
  }

  function closeHistoryModal() {
    setHistoryReservationId(null);
    setExpandedHistoryEntryId(null);
  }

  // Admins can book on behalf of any family, so we need the full family list.
  const [families, setFamilies] = useState<Family[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number>(currentUserId);
  const [selectedPersonIds, setSelectedPersonIds] = useState<number[]>([]);
  const [selectedCarIds, setSelectedCarIds] = useState<number[]>([]);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    api
      .listFamilies()
      .then((res) => {
        if (!cancelled) setFamilies(res.families);
      })
      .catch(() => {
        // Non-fatal: the dropdown just falls back to the current admin family.
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  const userOptions = useMemo<ComboboxOption<number>[]>(() => {
    if (families.length === 0) {
      return [{ value: currentUserId, label: 'Jaz' }];
    }
    return families.map((family) => ({
      value: family.id,
      label: family.familyName,
    }));
  }, [families, currentUserId]);

  // Members available to pick as attendees, for whichever family owns the booking.
  function personsForFamily(familyId: number): Person[] {
    if (familyId === currentUserId && user) return user.persons;
    return families.find((family) => family.id === familyId)?.persons ?? [];
  }

  // Cars available to bring, for whichever family owns the booking.
  function carsForFamily(familyId: number): Car[] {
    if (familyId === currentUserId && user) return user.cars;
    return families.find((family) => family.id === familyId)?.cars ?? [];
  }

  const availablePersons = personsForFamily(selectedUserId);
  const availableCars = carsForFamily(selectedUserId);

  // Admins manage every reservation; regular families only their own.
  const visibleReservations = useMemo(
    () =>
      reservations
        .filter((reservation) => isAdmin || reservation.userId === currentUserId)
        .sort((a, b) => a.startDay.localeCompare(b.startDay) || a.endDay.localeCompare(b.endDay)),
    [reservations, currentUserId, isAdmin],
  );

  // Per-reservation breakdown driving both the table columns and the
  // expandable detail panel — computed for every reservation at once (see
  // buildReservationBreakdowns for why: family day-splitting needs the full
  // list regardless of which rows are currently filtered into view).
  const breakdownsById = useMemo(
    () => buildReservationBreakdowns(reservations, settingsForYear, bungalovPricing),
    [reservations, settingsForYear, bungalovPricing],
  );

  // Distinct years present in the visible reservations, for the year filter chips.
  // Always includes the current year and the next one, even before any
  // reservation exists for them, so next year's chip is there ahead of time.
  const yearFilters = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const years = new Set<number>([currentYear, currentYear + 1]);
    for (const reservation of visibleReservations) {
      years.add(yearOfDay(reservation.startDay));
    }
    return [...years].sort((a, b) => a - b);
  }, [visibleReservations]);

  // Keep the active year valid if it no longer has bookings (and isn't the current year).
  useEffect(() => {
    if (filterYear !== null && !yearFilters.includes(filterYear)) {
      selectYearFilter(new Date().getFullYear());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearFilters, filterYear]);

  const yearFilteredReservations = useMemo(
    () =>
      filterYear === null
        ? visibleReservations
        : visibleReservations.filter(
            (reservation) => yearOfDay(reservation.startDay) === filterYear,
          ),
    [visibleReservations, filterYear],
  );

  const lines = useMemo(
    () =>
      yearFilteredReservations.map((reservation) => {
        const breakdown = breakdownsById.get(reservation.id)!;
        return {
          reservation,
          days: nightCountInRange(reservation.startDay, reservation.endDay),
          breakdown,
          // Until this reservation's amount is frozen by a price confirmation,
          // it can still move as other families book the same year.
          priceMayChange: !breakdown.frozen,
        };
      }),
    [yearFilteredReservations, breakdownsById],
  );

  // Distinct families present in the (year-filtered) reservations, for the filter chips.
  const familyFilters = useMemo(() => {
    const byId = new Map<number, string>();
    for (const reservation of yearFilteredReservations) {
      if (!byId.has(reservation.userId)) byId.set(reservation.userId, reservation.ownerName);
    }
    return [...byId.entries()].map(([id, name]) => ({ id, name }));
  }, [yearFilteredReservations]);

  // The `druzina` param names a family by its slugified name, not its id —
  // resolved against the current chip list, which is itself year-filtered.
  const filterFamilyId = familyParam
    ? (familyFilters.find((f) => slugify(f.name) === familyParam)?.id ?? null)
    : null;

  // Keep the active filter valid if the selected family no longer has bookings.
  useEffect(() => {
    if (familyParam !== null && !familyFilters.some((f) => slugify(f.name) === familyParam)) {
      selectFamilyFilter(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyFilters, familyParam]);

  // The breakdown per reservation still accounts for every family sharing a day;
  // the filter only narrows which rows (and totals) are shown.
  const filteredLines = useMemo(
    () =>
      filterFamilyId === null
        ? lines
        : lines.filter((line) => line.reservation.userId === filterFamilyId),
    [lines, filterFamilyId],
  );

  const totals = useMemo(
    () =>
      filteredLines.reduce(
        (sum, line) => ({
          simuni: sum.simuni + line.breakdown.simuni,
          bungalov: sum.bungalov + line.breakdown.bungalov,
          total: sum.total + line.breakdown.total,
        }),
        { simuni: 0, bungalov: 0, total: 0 },
      ),
    [filteredLines],
  );

  // Per-day family count for calendar dot rendering in the modal.
  // Each dot represents one distinct family with a reservation on that day.
  // The reservation currently being edited is excluded so its own days don't
  // produce dots.
  const modalOccupancy = useMemo(() => {
    const familiesPerDay = new Map<string, Set<number>>();
    for (const reservation of reservations) {
      if (editing && reservation.id === editing.id) continue;
      for (const day of eachNightKeyInRange(reservation.startDay, reservation.endDay)) {
        let set = familiesPerDay.get(day);
        if (!set) {
          set = new Set();
          familiesPerDay.set(day, set);
        }
        set.add(reservation.userId);
      }
    }
    const result = new Map<string, number>();
    for (const [day, families] of familiesPerDay) {
      result.set(day, families.size);
    }
    return result;
  }, [reservations, editing]);

  // Days that another reservation already holds remain selectable now that
  // several families may share the bungalow; we keep all days enabled.
  const disabledDays = useMemo<Date[]>(() => [], []);

  // Detailed price estimate for the currently selected range: overlapping
  // families, per-season bungalov share, and Simuni person/tax charges.
  const selectionEstimate = useMemo((): SelectionEstimate | null => {
    if (!range?.from) return null;

    const startKey = toDayKey(range.from);
    const endKey = toDayKey(range.to ?? range.from);
    const selectedDays = eachNightKeyInRange(startKey, endKey);
    if (selectedDays.length === 0) return null;

    // Per-reservation charges (pavšal, tax rate, accommodation fee) bill under
    // the check-in year; per-night charges below resolve their own year via
    // bungalovPricing.poolForDay, so a selection spanning a year boundary still
    // prices each night correctly.
    const selectionSettings = settingsForYear(yearOfDay(startKey));

    // Build family presence map from all reservations except the one being edited.
    const familyNames = new Map<number, string>();
    const famsPerDay = new Map<string, Set<number>>();
    for (const reservation of reservations) {
      if (editing && reservation.id === editing.id) continue;
      if (!familyNames.has(reservation.userId)) {
        familyNames.set(reservation.userId, reservation.ownerName);
      }
      for (const day of eachNightKeyInRange(reservation.startDay, reservation.endDay)) {
        let set = famsPerDay.get(day);
        if (!set) {
          set = new Set();
          famsPerDay.set(day, set);
        }
        set.add(reservation.userId);
      }
    }

    // Families that overlap with the selected range.
    const overlapDays = new Map<number, number>();
    for (const day of selectedDays) {
      const families = famsPerDay.get(day);
      if (!families) continue;
      for (const familyId of families) {
        overlapDays.set(familyId, (overlapDays.get(familyId) ?? 0) + 1);
      }
    }
    const overlappingFamilies = [...overlapDays.entries()]
      .map(([userId, days]) => ({ name: familyNames.get(userId) ?? '?', days }))
      .sort((a, b) => b.days - a.days);

    // Project occupied days (existing + new selection) for weight computation,
    // grouped per year so booking into one year never re-weighs another's pool.
    const projectedOccupied = new Set<string>();
    for (const [day] of famsPerDay) projectedOccupied.add(day);
    for (const day of selectedDays) projectedOccupied.add(day);

    const weightOf = (day: string) => {
      const pool = bungalovPricing.poolForDay(day);
      return dayWeight(pool.settings.seasons, pool.maxAdult, day);
    };
    const projectedWeightByYear = new Map<number, number>();
    for (const day of projectedOccupied) {
      const year = yearOfDay(day);
      projectedWeightByYear.set(year, (projectedWeightByYear.get(year) ?? 0) + weightOf(day));
    }

    // Persons attending this reservation (for Simuni calculation).
    const selectedPersons = availablePersons.filter((p) => selectedPersonIds.includes(p.id));

    // Group selected days by year + season (preserving order of first
    // appearance). Years matter here now that seasons can differ per year —
    // and keeping the season object directly (rather than re-finding it by
    // label later) avoids collisions once two years share a season's label.
    const groupOrder: string[] = [];
    type GroupAccum = {
      year: number;
      seasonName: string | null;
      season: Season | null;
      dayKeys: string[];
    };
    const groupMap = new Map<string, GroupAccum>();
    for (const day of selectedDays) {
      const year = yearOfDay(day);
      const pool = bungalovPricing.poolForDay(day);
      const season = seasonForDay(pool.settings.seasons, day);
      const key = `${year}|${season ? seasonLabel(season) : '__none__'}`;
      if (!groupMap.has(key)) {
        groupOrder.push(key);
        groupMap.set(key, {
          year,
          seasonName: season ? seasonLabel(season) : null,
          season,
          dayKeys: [],
        });
      }
      groupMap.get(key)!.dayKeys.push(day);
    }

    const taxPayerCount = touristTaxPayerCount(selectionSettings, selectedPersons);

    let totalBungalov = 0;
    let totalSimuniPersons = 0;
    let totalSimuniTax = 0;

    const seasonGroups: EstimateSeasonGroup[] = groupOrder.map((key) => {
      const { year, seasonName, season, dayKeys } = groupMap.get(key)!;
      const dayCount = dayKeys.length;
      const pool = bungalovPricing.poolForYear(year);
      const yearSettings = settingsForYear(year);
      const projectedWeight = projectedWeightByYear.get(year) ?? 0;
      const discountPercent = season ? seasonDiscountPercent(season, pool.maxAdult) : 0;

      // Bungalov share for this group's days.
      let bungalovGroupTotal = 0;
      let famSum = 0;
      for (const day of dayKeys) {
        const others = famsPerDay.get(day)?.size ?? 0;
        const fams = others + 1;
        famSum += fams;
        const w = weightOf(day);
        const dayPrice = projectedWeight > 0 ? (pool.discountedTotal * w) / projectedWeight : 0;
        bungalovGroupTotal += dayPrice / fams;
      }
      const avgFams = dayCount > 0 ? Math.round(famSum / dayCount) : 1;
      totalBungalov += bungalovGroupTotal;

      // Simuni per-person cost for this group (non-pavšal attendees only).
      const personRows: EstimatePersonRow[] = [];
      if (season) {
        for (const person of selectedPersons) {
          if (person.naPausalu) continue;
          const band = ageBand(computeAge(person.birthday));
          const nightlyPrice = seasonPriceForBand(season, band);
          const total = nightlyPrice * dayCount;
          personRows.push({
            personId: person.id,
            name: person.name,
            band,
            nightlyPrice,
            nights: dayCount,
            total,
          });
          totalSimuniPersons += total;
        }
      }

      const taxTotal = taxPayerCount * dayCount * yearSettings.touristTax;
      totalSimuniTax += taxTotal;

      return {
        seasonName,
        days: dayCount,
        discountPercent,
        bungalovTotal: bungalovGroupTotal,
        avgFams,
        personRows,
        taxTotal,
      };
    });

    const accommodationFee = accommodationFeeTotal(selectionSettings, selectedPersons.length);
    const simuni = totalSimuniPersons + totalSimuniTax + accommodationFee;

    return {
      label: formatDayRange(startKey, endKey),
      selectedDays: selectedDays.length,
      overlappingFamilies,
      seasonGroups,
      bungalovPausal: selectionSettings.pausalPrice,
      bungalovDiscountPercent: selectionSettings.oneoffDiscountPercent,
      bungalovDiscountAmount:
        selectionSettings.pausalPrice * (selectionSettings.oneoffDiscountPercent / 100),
      bungalovDiscountedTotal: bungalovPricing.poolForYear(yearOfDay(startKey)).discountedTotal,
      simuniPersons: totalSimuniPersons,
      simuniTax: totalSimuniTax,
      touristTaxPayers: taxPayerCount,
      touristTaxRate: selectionSettings.touristTax,
      touristTaxExemptAge: selectionSettings.touristTaxExemptAge,
      accommodationFee,
      accommodationFeeRate: selectionSettings.accommodationFee,
      simuni,
      bungalov: totalBungalov,
      total: simuni + totalBungalov,
    };
  }, [
    range,
    editing,
    reservations,
    bungalovPricing,
    settingsForYear,
    selectedPersonIds,
    availablePersons,
  ]);

  // Re-seed the form fields whenever the URL switches to a new create/edit
  // target — not on every unrelated data refresh, which would otherwise
  // clobber in-progress edits (e.g. toggling "Bungalov plačan" mid-edit).
  useEffect(() => {
    if (createMatch) {
      setRange(undefined);
      setSelectedUserId(currentUserId);
      setSelectedPersonIds(personsForFamily(currentUserId).map((person) => person.id));
      setSelectedCarIds([]);
      setCheckinMode('manual');
      setFormError(null);
      return;
    }
    if (!editing) return;
    setRange({
      from: parseDayKey(editing.startDay),
      to: parseDayKey(editing.endDay),
    });
    setSelectedUserId(editing.userId);
    setSelectedPersonIds(editing.persons.map((person) => person.id));
    setSelectedCarIds(editing.cars.map((car) => car.id));
    setCheckinMode(editing.checkinMode);
    setFormError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createMatch, editSlug]);

  function openCreate() {
    navigate('/razpolozljivost/nova-rezervacija');
  }

  function openEdit(reservation: Reservation) {
    navigate(`/razpolozljivost/rezervacija/${reservationSlug(reservation)}`);
  }

  function handleFamilyChange(familyId: number) {
    setSelectedUserId(familyId);
    // Default to the whole family attending when switching families.
    setSelectedPersonIds(personsForFamily(familyId).map((person) => person.id));
    setSelectedCarIds([]);
  }

  function togglePerson(personId: number) {
    setSelectedPersonIds((prev) =>
      prev.includes(personId) ? prev.filter((id) => id !== personId) : [...prev, personId],
    );
  }

  function toggleCar(carId: number) {
    setSelectedCarIds((prev) =>
      prev.includes(carId) ? prev.filter((id) => id !== carId) : [...prev, carId],
    );
  }

  function closeModal() {
    if (saving) return;
    navigate('/razpolozljivost');
  }

  async function handleSave() {
    if (!range?.from) return;
    const end = range.to ?? range.from;
    const input: ReservationRangeInput = {
      startDay: toDayKey(range.from),
      endDay: toDayKey(end),
      personIds: selectedPersonIds,
      carIds: selectedCarIds,
      checkinMode,
      ...(isAdmin ? { userId: selectedUserId } : {}),
    };

    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await onUpdateReservation(editing.id, input);
      } else {
        await onCreateReservation(input);
      }
      navigate('/razpolozljivost');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Napaka pri shranjevanju.');
    } finally {
      setSaving(false);
    }
  }

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  async function handleDelete() {
    if (!editing) return;
    setSaving(true);
    setFormError(null);
    try {
      await onDeleteReservation(editing.id);
      setDeleteConfirmOpen(false);
      navigate('/razpolozljivost');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Napaka pri brisanju.');
      setDeleteConfirmOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <Card as="section">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-brand-dark">
            {isAdmin ? 'Vse rezervacije' : 'Moje rezervacije'}
          </h2>
          <Button icon={Plus} onClick={openCreate}>
            Dodaj rezervacijo
          </Button>
        </div>

        {yearFilters.length > 1 && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-brand/60">Leto</span>
            <button
              type="button"
              onClick={() => selectYearFilter(null)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                filterYear === null
                  ? 'bg-brand text-white'
                  : 'bg-sky/70 text-brand-dark hover:bg-sky'
              }`}
            >
              Vse
            </button>
            {yearFilters.map((year) => (
              <button
                key={year}
                type="button"
                onClick={() => selectYearFilter(year)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  filterYear === year
                    ? 'bg-brand text-white'
                    : 'bg-sky/70 text-brand-dark hover:bg-sky'
                }`}
              >
                {year}
              </button>
            ))}
          </div>
        )}

        {isAdmin && familyFilters.length > 1 && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-brand/60">
              Družina
            </span>
            <button
              type="button"
              onClick={() => selectFamilyFilter(null)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                filterFamilyId === null
                  ? 'bg-brand text-white'
                  : 'bg-sky/70 text-brand-dark hover:bg-sky'
              }`}
            >
              Vse
            </button>
            {familyFilters.map((family) => (
              <button
                key={family.id}
                type="button"
                onClick={() => selectFamilyFilter(family.name)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  filterFamilyId === family.id
                    ? 'bg-brand text-white'
                    : 'bg-sky/70 text-brand-dark hover:bg-sky'
                }`}
              >
                {family.name}
              </button>
            ))}
          </div>
        )}

        {filteredLines.length === 0 ? (
          <p className="text-sm text-brand-dark">
            {isAdmin
              ? 'Ni rezervacij. Klikni „Dodaj rezervacijo“, da ustvariš novo.'
              : 'Še nimaš rezervacij. Klikni „Dodaj rezervacijo“, da ustvariš novo.'}
          </p>
        ) : (
          <>
            {/* ── Mobile card list (< xl, overridden to 1050px) ────────── */}
            <div className="space-y-2 xl:hidden">
              {filteredLines.map(({ reservation, days, breakdown, priceMayChange }) => {
                const expanded = expandedId === reservation.id;
                return (
                  <CardRow key={reservation.id}>
                    <div className="flex items-start justify-between gap-2 px-3 py-3">
                      <div>
                        <p className="flex flex-wrap items-center gap-1.5 font-medium text-brand-dark">
                          {formatDayRange(reservation.startDay, reservation.endDay)}
                          <OnlineCheckinLabel reservation={reservation} />
                        </p>
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-brand/60">
                          {isAdmin && (
                            <span className="font-medium">{reservation.ownerName} ·</span>
                          )}
                          <span>{nightCountLabel(days)}</span>
                          <span aria-hidden>·</span>
                          <AttendeeCounts persons={reservation.persons} />
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <HistoryButton
                          reservation={reservation}
                          onClick={() => openHistory(reservation)}
                        />
                        <Button
                          variant="transparent"
                          color="brand"
                          size="iconSm"
                          icon={Pencil}
                          aria-label="Uredi rezervacijo"
                          title="Uredi rezervacijo"
                          onClick={() => openEdit(reservation)}
                          className="rounded-full text-brand"
                        />
                        <Button
                          variant="transparent"
                          color="brand"
                          size="iconSm"
                          icon={expanded ? ChevronDown : ChevronRight}
                          aria-label={expanded ? 'Skrij razčlenitev' : 'Pokaži razčlenitev'}
                          title="Razčlenitev cene"
                          aria-expanded={expanded}
                          onClick={() =>
                            setExpandedId((prev) =>
                              prev === reservation.id ? null : reservation.id,
                            )
                          }
                          className="rounded-full text-brand"
                        />
                      </div>
                    </div>
                    <div
                      className={`grid divide-x divide-brand/10 border-t border-brand/10 ${
                        hideBungalov ? 'grid-cols-2' : 'grid-cols-4'
                      }`}
                    >
                      <div className="px-3 py-2">
                        <p className="text-[10px] uppercase tracking-wide text-brand/50">Šimuni</p>
                        <p className="text-sm font-medium text-brand-dark">
                          {formatEur(breakdown.simuni)}
                        </p>
                      </div>
                      {!hideBungalov && (
                        <div className="px-3 py-2">
                          <p className="text-[10px] uppercase tracking-wide text-brand/50">
                            Bungalov
                          </p>
                          <p className="text-sm font-semibold text-brand-dark">
                            {formatEur(breakdown.bungalov)}
                          </p>
                        </div>
                      )}
                      <div className="px-3 py-2">
                        <p className="text-[10px] uppercase tracking-wide text-brand/50">Skupaj</p>
                        <p className="text-sm font-semibold text-brand">
                          {formatEur(hideBungalov ? breakdown.simuni : breakdown.total)}
                        </p>
                      </div>
                      {!hideBungalov && (
                        <div className="px-3 py-2">
                          <p className="text-[10px] uppercase tracking-wide text-brand/50">
                            Plačilo
                          </p>
                          <PaymentColumnLabel
                            priceMayChange={priceMayChange}
                            bungalovPaid={reservation.bungalovPaid}
                            year={yearOfDay(reservation.startDay)}
                          />
                        </div>
                      )}
                    </div>
                    {expanded && (
                      <div className="space-y-2 border-t border-brand/10 px-3 pb-3 pt-2">
                        <ReservationBreakdown breakdown={breakdown} hideBungalov={hideBungalov} />
                      </div>
                    )}
                  </CardRow>
                );
              })}

              {/* Mobile totals row */}
              <div
                className={`grid divide-x divide-brand/15 rounded-xl border border-brand/15 bg-sky/40 ${
                  hideBungalov ? 'grid-cols-2' : 'grid-cols-3'
                }`}
              >
                <div className="px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-brand/50">Šimuni</p>
                  <p className="text-sm font-semibold text-brand-dark">
                    {formatEur(totals.simuni)}
                  </p>
                </div>
                {!hideBungalov && (
                  <div className="px-3 py-2.5">
                    <p className="text-[10px] uppercase tracking-wide text-brand/50">Bungalov</p>
                    <p className="text-sm font-bold text-brand">{formatEur(totals.bungalov)}</p>
                  </div>
                )}
                <div className="px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-brand/50">Skupaj</p>
                  <p className="text-sm font-semibold text-brand-dark">
                    {formatEur(hideBungalov ? totals.simuni : totals.total)}
                  </p>
                </div>
              </div>

              {!hideBungalov && (
                <p className="text-xs text-brand/60">
                  Med družine se deli samo najemnina za bungalov. „Za plačati Šimuni“ vključuje ceno
                  na osebo za tiste, ki niso na pavšalu, turistično takso in enkratno plačilo
                  nastanitve.
                </p>
              )}
            </div>

            {/* ── Desktop table (xl+, overridden to 1050px) ────────────── */}
            <div className="hidden overflow-x-auto xl:block">
              <table className="w-full table-fixed text-sm">
                <colgroup>
                  {/* Only this column is flexible; the rest are fixed px so the
                      row content (e.g. the expanded breakdown) or the container's
                      own width (e.g. a scrollbar toggling) can never resize them. */}
                  <col />
                  <col className="w-26" />
                  {!hideBungalov && <col className="w-26" />}
                  <col className="w-26" />
                  {!hideBungalov && <col className="w-32" />}
                  <col className="w-32" />
                </colgroup>
                <thead>
                  <tr className="border-b border-brand/10 text-left text-xs uppercase tracking-wide text-brand/60">
                    <th className="py-2 pr-3 font-medium">Obdobje</th>
                    <th className="py-2 px-3 text-right font-medium">Za plačati Šimuni</th>
                    {!hideBungalov && (
                      <th className="py-2 px-3 text-right font-medium">Za plačati bungalov</th>
                    )}
                    <th className="py-2 px-3 text-right font-medium">Skupaj</th>
                    {!hideBungalov && <th className="py-2 px-3 font-medium">Plačilo</th>}
                    <th className="py-2 pl-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand/10">
                  {filteredLines.map(({ reservation, days, breakdown, priceMayChange }) => {
                    const expanded = expandedId === reservation.id;
                    return (
                      <Fragment key={reservation.id}>
                        <tr className="align-middle">
                          <td className="py-2.5 pr-3">
                            <p className="flex flex-wrap items-center gap-1.5 font-medium text-brand-dark">
                              {formatDayRange(reservation.startDay, reservation.endDay)}
                              <OnlineCheckinLabel reservation={reservation} />
                            </p>
                            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-brand/60">
                              {isAdmin && (
                                <span className="font-medium">{reservation.ownerName} ·</span>
                              )}
                              <span>{nightCountLabel(days)}</span>
                              <span aria-hidden>·</span>
                              <AttendeeCounts persons={reservation.persons} />
                            </p>
                          </td>
                          <td className="whitespace-nowrap py-2.5 px-3 text-right text-brand-dark">
                            {formatEur(breakdown.simuni)}
                          </td>
                          {!hideBungalov && (
                            <td className="whitespace-nowrap py-2.5 px-3 text-right font-semibold text-brand-dark">
                              {formatEur(breakdown.bungalov)}
                            </td>
                          )}
                          <td className="whitespace-nowrap py-2.5 px-3 text-right font-semibold text-brand-dark">
                            {formatEur(hideBungalov ? breakdown.simuni : breakdown.total)}
                          </td>
                          {!hideBungalov && (
                            <td className="py-2.5 px-3 align-middle">
                              <PaymentColumnLabel
                                priceMayChange={priceMayChange}
                                bungalovPaid={reservation.bungalovPaid}
                                year={yearOfDay(reservation.startDay)}
                              />
                            </td>
                          )}
                          <td className="py-2.5 pl-3">
                            <div className="flex items-center justify-end gap-1">
                              <HistoryButton
                                reservation={reservation}
                                onClick={() => openHistory(reservation)}
                              />
                              <Button
                                variant="transparent"
                                color="brand"
                                size="iconSm"
                                icon={Pencil}
                                aria-label="Uredi rezervacijo"
                                title="Uredi rezervacijo"
                                onClick={() => openEdit(reservation)}
                                className="rounded-full text-brand"
                              />
                              <Button
                                variant="transparent"
                                color="brand"
                                size="iconSm"
                                icon={expanded ? ChevronDown : ChevronRight}
                                aria-label={expanded ? 'Skrij razčlenitev' : 'Pokaži razčlenitev'}
                                title="Razčlenitev cene"
                                aria-expanded={expanded}
                                onClick={() =>
                                  setExpandedId((prev) =>
                                    prev === reservation.id ? null : reservation.id,
                                  )
                                }
                                className="rounded-full text-brand"
                              />
                            </div>
                          </td>
                        </tr>
                        {expanded && (
                          <tr>
                            <td colSpan={hideBungalov ? 4 : 6} className="pb-3 pt-1">
                              <ReservationBreakdown
                                breakdown={breakdown}
                                hideBungalov={hideBungalov}
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-brand/15">
                    <td className="py-3 pr-3 text-sm font-semibold text-brand-dark">Skupaj</td>
                    <td className="whitespace-nowrap py-3 px-3 text-right font-semibold text-brand-dark">
                      {formatEur(totals.simuni)}
                    </td>
                    {!hideBungalov && (
                      <td className="whitespace-nowrap py-3 px-3 text-right text-lg font-bold text-brand">
                        {formatEur(totals.bungalov)}
                      </td>
                    )}
                    <td
                      className={`whitespace-nowrap py-3 px-3 text-right font-semibold text-brand-dark ${
                        hideBungalov ? 'text-lg font-bold text-brand' : ''
                      }`}
                    >
                      {formatEur(hideBungalov ? totals.simuni : totals.total)}
                    </td>
                    {!hideBungalov && <td className="py-3 px-3" />}
                    <td className="py-3 pl-3" />
                  </tr>
                </tfoot>
              </table>
              {!hideBungalov && (
                <p className="mt-3 text-xs text-brand/60">
                  Med družine se deli samo najemnina za bungalov. „Za plačati Šimuni“ vključuje ceno
                  na osebo za tiste, ki niso na pavšalu, turistično takso in enkratno plačilo
                  nastanitve.
                </p>
              )}
            </div>
          </>
        )}
      </Card>

      <Calendar
        reservations={reservations}
        currentUserId={currentUserId}
        canEditAll={isAdmin}
        priceForDay={bungalovPricing.priceForDay}
        formatPrice={formatEur}
        hidePrice={hideBungalov}
        onEditReservation={openEdit}
      />

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editing ? 'Uredi rezervacijo' : 'Dodaj rezervacijo'}
        className="max-w-2xl"
        footer={
          <div className="flex w-full items-center justify-between gap-2">
            <div>
              {editing && (
                <Button
                  variant="outline"
                  color="danger"
                  icon={Trash2}
                  onClick={() => setDeleteConfirmOpen(true)}
                  disabled={saving}
                >
                  Izbriši
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="transparent" color="brand" onClick={closeModal} disabled={saving}>
                Prekliči
              </Button>
              <Button onClick={handleSave} disabled={saving || !range?.from}>
                {editing ? 'Shrani' : 'Potrdi'}
              </Button>
            </div>
          </div>
        }
      >
        {isAdmin && (
          <div className="mb-4">
            <label
              htmlFor="reservation-user"
              className="mb-1 block text-sm font-medium text-brand-dark"
            >
              Družina
            </label>
            <Combobox
              id="reservation-user"
              icon={Home}
              value={selectedUserId}
              onChange={handleFamilyChange}
              disabled={saving}
              aria-label="Družina"
              options={userOptions}
            />
          </div>
        )}

        <div className="mb-4">
          <span className="mb-1.5 block text-sm font-medium text-brand-dark">Kdo prihaja?</span>
          {availablePersons.length === 0 ? (
            <AlertBox variant="info">Ta družina še nima dodanih oseb.</AlertBox>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {availablePersons.map((person) => {
                const age = computeAge(person.birthday);
                const child = isChild(person.birthday);
                const checked = selectedPersonIds.includes(person.id);
                return (
                  <Checkbox
                    key={person.id}
                    checked={checked}
                    onChange={() => togglePerson(person.id)}
                    disabled={saving}
                    icon={child ? Baby : UserIcon}
                    label={person.name}
                    labelClassName="font-medium"
                    trailing={age !== null ? `${age} let` : undefined}
                  />
                );
              })}
            </div>
          )}
        </div>

        <div className="mb-4">
          <span className="mb-1.5 block text-sm font-medium text-brand-dark">
            S katerimi avtomobili prihajate?
          </span>
          {availableCars.length === 0 ? (
            <AlertBox variant="info">Ta družina še nima dodanih avtomobilov.</AlertBox>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {availableCars.map((car) => {
                const checked = selectedCarIds.includes(car.id);
                return (
                  <Checkbox
                    key={car.id}
                    checked={checked}
                    onChange={() => toggleCar(car.id)}
                    disabled={saving}
                    icon={CarIcon}
                    label={car.name}
                    labelClassName="font-medium"
                    trailing={car.registrationPlate || undefined}
                  />
                );
              })}
            </div>
          )}
        </div>

        <p className="mb-3 text-sm text-brand/70">
          Izberi obdobje rezervacije: klikni začetni in nato končni dan.
        </p>
        <DateRangePicker
          value={range}
          onChange={setRange}
          disabledDays={disabledDays}
          disablePast={false}
          defaultMonth={range?.from}
          numberOfMonths={2}
          occupancy={modalOccupancy}
        />

        {selectionEstimate ? (
          <CardSection shade="medium" className="mt-4 space-y-4 text-sm">
            {/* Header */}
            <div className="flex items-center justify-between">
              <span className="font-medium text-brand-dark">{selectionEstimate.label}</span>
              <span className="text-xs text-brand/60">
                {nightCountLabel(selectionEstimate.selectedDays)}
              </span>
            </div>

            {/* Overlapping families */}
            {selectionEstimate.overlappingFamilies.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-brand/60">Hkrati v bungalovu:</span>
                {selectionEstimate.overlappingFamilies.map((f, i) => (
                  <span
                    key={i}
                    className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand-dark"
                  >
                    {f.name}
                    {selectionEstimate.selectedDays !== f.days && ` · ${nightCountLabel(f.days)}`}
                  </span>
                ))}
              </div>
            )}

            {/* Bungalov section */}
            {!hideBungalov && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-brand/50">
                  Bungalov
                </p>

                {/* Per-season bungalov breakdown */}
                {selectionEstimate.seasonGroups.map((group, i) => (
                  <div
                    key={i}
                    className="flex items-start justify-between rounded-xl bg-white/60 px-3 py-2 text-xs"
                  >
                    <div className="leading-relaxed">
                      <span className="font-medium text-brand-dark">
                        {group.seasonName ?? '(zunaj sezone)'}
                      </span>
                      <span className="ml-2 text-brand/50">
                        {nightCountLabel(group.days)} x{' '}
                        {formatEur(group.bungalovTotal / group.days)}
                      </span>
                      {group.discountPercent > 0 && (
                        <span className="ml-2 text-brand/50">
                          ({group.discountPercent.toFixed(0)}% popusta)
                        </span>
                      )}
                      {group.avgFams > 1 && (
                        <span className="ml-2 text-brand/50">÷ {group.avgFams} drž.</span>
                      )}
                    </div>
                    <span className="ml-3 shrink-0 font-semibold text-brand-dark">
                      {formatEur(group.bungalovTotal)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Šimuni section */}
            {(selectionEstimate.seasonGroups.some((g) => g.personRows.length > 0) ||
              selectionEstimate.simuniTax > 0 ||
              selectionEstimate.accommodationFee > 0) && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-brand/50">
                  Šimuni
                </p>
                <div className="rounded-xl bg-white/60 px-3 py-2 text-xs space-y-1">
                  {selectionEstimate.seasonGroups.length > 1
                    ? selectionEstimate.seasonGroups.map((group, gi) =>
                        group.personRows.length > 0 ? (
                          <div key={gi}>
                            <p className="mb-0.5 text-brand/40">{group.seasonName}</p>
                            {group.personRows.map((row, ri) => (
                              <div key={ri} className="flex justify-between pl-2 text-brand/70">
                                <span>
                                  {row.name}{' '}
                                  <span className="text-brand/40">({BAND_LABEL[row.band]})</span>{' '}
                                  <span className="text-brand/40">
                                    {row.nights} × {formatEur(row.nightlyPrice)}
                                  </span>
                                </span>
                                <span className="ml-2 shrink-0 font-medium text-brand-dark">
                                  {formatEur(row.total)}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : null,
                      )
                    : selectionEstimate.seasonGroups[0]?.personRows.map((row, ri) => (
                        <div key={ri} className="flex justify-between text-brand/70">
                          <span>
                            {row.name}{' '}
                            <span className="text-brand/40">({BAND_LABEL[row.band]})</span>{' '}
                            <span className="text-brand/40">
                              {row.nights} × {formatEur(row.nightlyPrice)}
                            </span>
                          </span>
                          <span className="ml-2 shrink-0 font-medium text-brand-dark">
                            {formatEur(row.total)}
                          </span>
                        </div>
                      ))}

                  {selectionEstimate.simuniTax > 0 && (
                    <div className="flex justify-between text-brand/70">
                      <span>
                        Turistična taksa{' '}
                        <span className="text-brand/40">
                          {selectionEstimate.touristTaxPayers} os. ×{' '}
                          {selectionEstimate.selectedDays}{' '}
                          {selectionEstimate.selectedDays === 1 ? 'noč' : 'noči'} ×{' '}
                          {formatEur(selectionEstimate.touristTaxRate)}
                          {selectionEstimate.touristTaxPayers < selectedPersonIds.length &&
                            ` (otroci do ${selectionEstimate.touristTaxExemptAge} let brez takse)`}
                        </span>
                      </span>
                      <span className="ml-2 shrink-0 font-medium text-brand-dark">
                        {formatEur(selectionEstimate.simuniTax)}
                      </span>
                    </div>
                  )}

                  {selectionEstimate.accommodationFee > 0 && (
                    <div className="flex justify-between text-brand/70">
                      <span>
                        Enkratno plačilo nastanitve{' '}
                        <span className="text-brand/40">
                          {selectedPersonIds.length} os. ×{' '}
                          {formatEur(selectionEstimate.accommodationFeeRate)}
                        </span>
                      </span>
                      <span className="ml-2 shrink-0 font-medium text-brand-dark">
                        {formatEur(selectionEstimate.accommodationFee)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Summary */}
            <div className="space-y-1 border-t border-brand/15 pt-3">
              <div className="flex justify-between text-xs text-brand/70">
                <span>Za plačati Šimuni</span>
                <span className="font-medium text-brand-dark">
                  {formatEur(selectionEstimate.simuni)}
                </span>
              </div>
              {!hideBungalov && (
                <div className="flex justify-between text-xs text-brand/70">
                  <span>Za plačati bungalov</span>
                  <span className="font-medium text-brand-dark">
                    {formatEur(selectionEstimate.bungalov)}
                  </span>
                </div>
              )}
              <div className="flex justify-between font-bold text-brand">
                <span>Skupaj ocena</span>
                <span className="text-lg">
                  {formatEur(hideBungalov ? selectionEstimate.simuni : selectionEstimate.total)}
                </span>
              </div>
              {!hideBungalov && (
                <p className="text-[10px] text-brand/50">
                  Bungalov se deli med vse družine prisotne ta dan.
                </p>
              )}
            </div>

            {isAdmin && editing && (
              <BungalovPaidToggle
                reservation={editing}
                onUpdate={(paid) => onUpdateReservationPayment(editing.id, paid)}
              />
            )}
          </CardSection>
        ) : (
          <AlertBox variant="info" className="mt-4">
            Izberi obdobje za oceno cene.
          </AlertBox>
        )}

        <div className="mt-4">
          <span className="mb-1.5 block text-sm font-medium text-brand-dark">Online prijava</span>
          <div className="space-y-2">
            <Radio
              name="checkin-mode"
              checked={checkinMode === 'online'}
              onChange={() => setCheckinMode('online')}
              disabled={saving}
              label="Online prijava"
              description="Na recepcijo grem samo ob odhodu, da poravnam bivanje v Šimunih."
            />
            <Radio
              name="checkin-mode"
              checked={checkinMode === 'manual'}
              onChange={() => setCheckinMode('manual')}
              disabled={saving}
              label="Osebna prijava"
              description="Prijavo in odjavo bom opravil/a sam/a na recepciji."
            />
          </div>
        </div>

        {formError && <AlertBox className="mt-3">{formError}</AlertBox>}
      </Modal>

      <ConfirmModal
        open={deleteConfirmOpen}
        title="Izbriši rezervacijo?"
        destructive
        busy={saving}
        confirmLabel="Izbriši"
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirmOpen(false)}
      >
        {editing &&
          `Rezervacija ${editing.ownerName} (${formatDayRange(editing.startDay, editing.endDay)}) bo trajno izbrisana.`}
      </ConfirmModal>

      <Modal
        open={historyReservationId !== null}
        onClose={closeHistoryModal}
        title={
          historyReservation
            ? `Zgodovina – ${formatDayRange(historyReservation.startDay, historyReservation.endDay)}${
                isAdmin ? ` (${historyReservation.ownerName})` : ''
              }`
            : 'Zgodovina'
        }
        className="max-w-lg"
      >
        {historyLoading ? (
          <p className="text-sm text-brand/60">Nalagam…</p>
        ) : historyError ? (
          <AlertBox>{historyError}</AlertBox>
        ) : history.length === 0 ? (
          <p className="text-sm text-brand/60">Ni sprememb.</p>
        ) : (
          <ul className="max-h-96 space-y-2 overflow-y-auto pr-1 text-xs text-brand-dark">
            {history.map((entry) => (
              <li key={entry.id} className="rounded-lg border border-brand/15 bg-sky/40 p-2.5">
                <p className="mb-0.5 flex items-center justify-between gap-2 text-[11px] text-brand/50">
                  <span className="font-medium text-brand-dark">
                    {entry.actorName}
                    {entry.actorRole === 'admin' ? ' (admin)' : ''}
                  </span>
                  <span className="shrink-0">{formatDateTime(entry.createdAt)}</span>
                </p>
                {describeHistoryChanges(entry).map((line, index) => (
                  <p key={index}>{line}</p>
                ))}
                {entry.action === 'email_sent' && entry.changes.subject && entry.changes.body && (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedHistoryEntryId((prev) => (prev === entry.id ? null : entry.id))
                      }
                      className="mt-1.5 flex items-center gap-1 font-medium text-brand hover:underline"
                    >
                      {expandedHistoryEntryId === entry.id ? (
                        <ChevronDown size={12} aria-hidden />
                      ) : (
                        <ChevronRight size={12} aria-hidden />
                      )}
                      {expandedHistoryEntryId === entry.id ? 'Skrij e-pošto' : 'Prikaži e-pošto'}
                    </button>
                    {expandedHistoryEntryId === entry.id && (
                      <div className="mt-1.5 rounded-lg bg-white p-2.5 ring-1 ring-brand/10">
                        <p className="mb-1 font-semibold text-brand-dark">
                          {entry.changes.subject}
                        </p>
                        <pre className="whitespace-pre-wrap font-sans text-brand-dark/90">
                          {entry.changes.body}
                        </pre>
                      </div>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </div>
  );
}
