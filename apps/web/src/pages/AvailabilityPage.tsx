import {
  Baby,
  Car as CarIcon,
  ChevronDown,
  ChevronRight,
  Home,
  Pencil,
  Plus,
  Trash2,
  User as UserIcon,
} from 'lucide-react';
import { Fragment, useEffect, useMemo, useState } from 'react';

import { Calendar } from '../components/Calendar';
import { Button } from '../components/ui/Button';
import { AlertBox, Card, CardRow, CardSection } from '../components/ui/Card';
import { Combobox, type ComboboxOption } from '../components/ui/Combobox';
import { DateRangePicker, type DateRange } from '../components/ui/DateRangePicker';
import { Label } from '../components/ui/Label';
import { Modal } from '../components/ui/Modal';
import { Tooltip } from '../components/ui/Tooltip';
import { api } from '../lib/api';
import {
  computeAge,
  eachNightKeyInRange,
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
  computeBungalovPricing,
  formatEur,
  isTouristTaxExempt,
  maxAdultPrice,
  seasonDiscountPercent,
  seasonForDay,
  seasonLabel,
  seasonPriceForBand,
  touristTaxPayerCount,
  type AgeBand,
} from '../lib/pricing';
import type {
  Car,
  Family,
  Person,
  Reservation,
  ReservationRangeInput,
  Settings,
} from '../lib/types';
import { useAuth } from '../state/AuthContext';

const BAND_LABEL: Record<AgeBand, string> = {
  child0_2: 'Otrok 0–2',
  child3_5: 'Otrok 3–5',
  child6_11: 'Otrok 6–11',
  adult: 'Odrasli',
  adultSenior: 'Odrasli 60+',
};

type BreakdownDay = {
  day: string;
  seasonName: string | null;
  discountPercent: number;
  personsCost: number;
  taxCost: number;
  taxPayers: number;
  fams: number;
  fullBungalov: number;
  bungalovCost: number;
};

type ReservationBreakdownData = {
  attendees: Array<{ person: Person; band: AgeBand; taxExempt: boolean }>;
  days: BreakdownDay[];
  simuniPersons: number;
  simuniTax: number;
  accommodationFee: number;
  simuni: number;
  bungalov: number;
  total: number;
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
  accommodationFee: number;
  simuni: number;
  bungalov: number;
  total: number;
};

/** Short `d. m.` label for a `YYYY-MM-DD` key. */
function shortDay(dayKey: string): string {
  const [, month, day] = dayKey.split('-').map(Number);
  return `${day}. ${month}.`;
}

export type AvailabilityPageProps = {
  settings: Settings;
  reservations: Reservation[];
  occupiedDays: Set<string>;
  currentUserId: number;
  /** Admins see and can edit every reservation, regardless of owner. */
  isAdmin?: boolean;
  onCreateReservation: (input: ReservationRangeInput) => Promise<void>;
  onUpdateReservation: (id: number, input: ReservationRangeInput) => Promise<void>;
  onDeleteReservation: (id: number) => Promise<void>;
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

/** Expanded detail panel explaining how a reservation's prices are derived. */
function ReservationBreakdown({
  breakdown,
  touristTax,
  accommodationFeeRate,
  touristTaxExemptAge,
}: {
  breakdown: ReservationBreakdownData;
  touristTax: number;
  accommodationFeeRate: number;
  touristTaxExemptAge: number;
}) {
  const { attendees, days, simuniPersons, simuniTax, accommodationFee, simuni, bungalov, total } =
    breakdown;
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
              <th className="pb-1 pr-3 text-right font-medium">Družin</th>
              <th className="pb-1 text-right font-medium">Bungalov</th>
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
                      ({d.taxPayers} × {formatEur(touristTax)}){' '}
                    </span>
                  )}
                  {formatEur(d.taxCost)}
                </td>
                <td className="whitespace-nowrap py-1 pr-3 text-right text-brand/70">
                  {d.discountPercent.toFixed(0)} %
                </td>
                <td className="whitespace-nowrap py-1 pr-3 text-right text-brand/70">{d.fams}×</td>
                <td className="whitespace-nowrap py-1 text-right font-medium">
                  {formatEur(d.bungalovCost)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <dl className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl bg-white p-2.5 ring-1 ring-brand/10">
          <dt className="text-[10px] uppercase tracking-wide text-brand/60">Za plačati Šimuni</dt>
          <dd className="font-semibold">{formatEur(simuni)}</dd>
          <p className="mt-0.5 text-[11px] text-brand/60">
            Osebe {formatEur(simuniPersons)} + taksa {formatEur(simuniTax)}
            {touristTax > 0 && ` (${formatEur(touristTax)}/osebo/noč)`} + nastanitev{' '}
            {formatEur(accommodationFee)}
            {accommodationFeeRate > 0 && ` (${formatEur(accommodationFeeRate)}/osebo)`}
          </p>
        </div>
        <div className="rounded-xl bg-white p-2.5 ring-1 ring-brand/10">
          <dt className="text-[10px] uppercase tracking-wide text-brand/60">Za plačati bungalov</dt>
          <dd className="font-semibold">{formatEur(bungalov)}</dd>
          <p className="mt-0.5 text-[11px] text-brand/60">
            Sezonsko utežena najemnina, deljena med družine.
          </p>
        </div>
        <div className="rounded-xl bg-white p-2.5 ring-1 ring-brand/10">
          <dt className="text-[10px] uppercase tracking-wide text-brand/60">Skupaj</dt>
          <dd className="font-semibold text-brand">{formatEur(total)}</dd>
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

export function AvailabilityPage({
  settings,
  reservations,
  occupiedDays,
  currentUserId,
  isAdmin = false,
  onCreateReservation,
  onUpdateReservation,
  onDeleteReservation,
}: AvailabilityPageProps) {
  const { user } = useAuth();
  const bungalovPricing = useMemo(
    () => computeBungalovPricing(settings, occupiedDays),
    [settings, occupiedDays],
  );
  const maxAdult = useMemo(() => maxAdultPrice(settings.seasons), [settings.seasons]);

  const [expandedId, setExpandedId] = useState<number | null>(null);
  // null = all families; otherwise restrict the table to one family's bookings.
  const [filterFamilyId, setFilterFamilyId] = useState<number | null>(null);
  // null = all years; otherwise restrict the table to one year's bookings.
  // Defaults to the current year.
  const [filterYear, setFilterYear] = useState<number | null>(() => new Date().getFullYear());
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Reservation | null>(null);
  const [range, setRange] = useState<DateRange | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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
        .sort((a, b) => a.startDay.localeCompare(b.startDay)),
    [reservations, currentUserId, isAdmin],
  );

  // For each day, how many reservations each family holds on it. A day's bungalov
  // price is split among the distinct families present; within a family it is
  // split again across that family's own (possibly overlapping) reservations, so
  // the total billed for a day never exceeds its season-weighted share.
  const familyReservationsPerDay = useMemo(() => {
    const byDay = new Map<string, Map<number, number>>();
    for (const reservation of reservations) {
      for (const day of eachNightKeyInRange(reservation.startDay, reservation.endDay)) {
        let perFamily = byDay.get(day);
        if (!perFamily) {
          perFamily = new Map();
          byDay.set(day, perFamily);
        }
        perFamily.set(reservation.userId, (perFamily.get(reservation.userId) ?? 0) + 1);
      }
    }
    return byDay;
  }, [reservations]);

  // Per-day, per-reservation breakdown driving both the table columns and the
  // expandable detail panel. Each day contributes a Šimuni charge (per-person
  // season prices for non-pavšal attendees + tourist tax) and a season-weighted
  // bungalov share that is split between the families present that day.
  const buildBreakdown = useMemo(() => {
    return (reservation: Reservation) => {
      const attendees = reservation.persons.map((person) => ({
        person,
        band: ageBand(computeAge(person.birthday)),
        taxExempt: isTouristTaxExempt(settings, person.birthday),
      }));
      const taxPayerCount = touristTaxPayerCount(settings, reservation.persons);

      const days = eachNightKeyInRange(reservation.startDay, reservation.endDay).map((day) => {
        const season = seasonForDay(settings.seasons, day);
        const perFamily = familyReservationsPerDay.get(day);
        const fams = perFamily?.size ?? 1;
        // This family's share is split across its own reservations covering the
        // day, so overlapping bookings by one family don't bill the day twice.
        const ownReservations = perFamily?.get(reservation.userId) ?? 1;

        let personsCost = 0;
        if (season) {
          for (const { person, band } of attendees) {
            if (!person.naPausalu) personsCost += seasonPriceForBand(season, band);
          }
        }
        const taxCost = taxPayerCount * settings.touristTax;
        const fullBungalov = bungalovPricing.priceForDay(day);

        return {
          day,
          seasonName: season ? seasonLabel(season) : null,
          discountPercent: season ? seasonDiscountPercent(season, maxAdult) : 0,
          personsCost,
          taxCost,
          taxPayers: taxPayerCount,
          fams,
          fullBungalov,
          bungalovCost: fullBungalov / fams / ownReservations,
        };
      });

      const simuniPersons = days.reduce((sum, d) => sum + d.personsCost, 0);
      const simuniTax = days.reduce((sum, d) => sum + d.taxCost, 0);
      const accommodationFee = accommodationFeeTotal(settings, reservation.persons.length);
      const bungalov = days.reduce((sum, d) => sum + d.bungalovCost, 0);
      const simuni = simuniPersons + simuniTax + accommodationFee;

      return {
        attendees,
        days,
        simuniPersons,
        simuniTax,
        accommodationFee,
        simuni,
        bungalov,
        total: simuni + bungalov,
      };
    };
  }, [
    familyReservationsPerDay,
    settings.seasons,
    settings.touristTax,
    settings.accommodationFee,
    settings.touristTaxExemptAge,
    bungalovPricing,
    maxAdult,
  ]);

  // Distinct years present in the visible reservations, for the year filter chips.
  // Always includes the current year and the next one, even before any
  // reservation exists for them, so next year's chip is there ahead of time.
  const yearFilters = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const years = new Set<number>([currentYear, currentYear + 1]);
    for (const reservation of visibleReservations) {
      years.add(Number(reservation.startDay.slice(0, 4)));
    }
    return [...years].sort((a, b) => a - b);
  }, [visibleReservations]);

  // Keep the active year valid if it no longer has bookings (and isn't the current year).
  useEffect(() => {
    if (filterYear !== null && !yearFilters.includes(filterYear)) {
      setFilterYear(new Date().getFullYear());
    }
  }, [yearFilters, filterYear]);

  const yearFilteredReservations = useMemo(
    () =>
      filterYear === null
        ? visibleReservations
        : visibleReservations.filter(
            (reservation) => Number(reservation.startDay.slice(0, 4)) === filterYear,
          ),
    [visibleReservations, filterYear],
  );

  const lines = useMemo(
    () =>
      yearFilteredReservations.map((reservation) => ({
        reservation,
        days: nightCountInRange(reservation.startDay, reservation.endDay),
        breakdown: buildBreakdown(reservation),
      })),
    [yearFilteredReservations, buildBreakdown],
  );

  // Distinct families present in the (year-filtered) reservations, for the filter chips.
  const familyFilters = useMemo(() => {
    const byId = new Map<number, string>();
    for (const reservation of yearFilteredReservations) {
      if (!byId.has(reservation.userId)) byId.set(reservation.userId, reservation.ownerName);
    }
    return [...byId.entries()].map(([id, name]) => ({ id, name }));
  }, [yearFilteredReservations]);

  // Keep the active filter valid if the selected family no longer has bookings.
  useEffect(() => {
    if (filterFamilyId !== null && !familyFilters.some((f) => f.id === filterFamilyId)) {
      setFilterFamilyId(null);
    }
  }, [familyFilters, filterFamilyId]);

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

    // Project occupied days (existing + new selection) for weight computation.
    const projectedOccupied = new Set<string>();
    for (const [day] of famsPerDay) projectedOccupied.add(day);
    for (const day of selectedDays) projectedOccupied.add(day);

    const weightOf = (day: string) => {
      if (maxAdult <= 0) return 1;
      const season = seasonForDay(settings.seasons, day);
      return season ? season.priceAdult / maxAdult : 1;
    };
    let projectedTotalWeight = 0;
    for (const day of projectedOccupied) projectedTotalWeight += weightOf(day);

    // Persons attending this reservation (for Simuni calculation).
    const selectedPersons = availablePersons.filter((p) => selectedPersonIds.includes(p.id));

    // Group selected days by season (preserving order of first appearance).
    const groupOrder: string[] = [];
    type GroupAccum = { seasonName: string | null; dayKeys: string[]; discountPercent: number };
    const groupMap = new Map<string, GroupAccum>();
    for (const day of selectedDays) {
      const season = seasonForDay(settings.seasons, day);
      const key = season ? seasonLabel(season) : '__none__';
      if (!groupMap.has(key)) {
        groupOrder.push(key);
        groupMap.set(key, {
          seasonName: season ? seasonLabel(season) : null,
          dayKeys: [],
          discountPercent: season ? seasonDiscountPercent(season, maxAdult) : 0,
        });
      }
      groupMap.get(key)!.dayKeys.push(day);
    }

    const taxPayerCount = touristTaxPayerCount(settings, selectedPersons);

    let totalBungalov = 0;
    let totalSimuniPersons = 0;
    let totalSimuniTax = 0;

    const seasonGroups: EstimateSeasonGroup[] = groupOrder.map((key) => {
      const { seasonName, dayKeys, discountPercent } = groupMap.get(key)!;
      const dayCount = dayKeys.length;

      // Bungalov share for this group's days.
      let bungalovGroupTotal = 0;
      let famSum = 0;
      for (const day of dayKeys) {
        const others = famsPerDay.get(day)?.size ?? 0;
        const fams = others + 1;
        famSum += fams;
        const w = weightOf(day);
        const dayPrice =
          projectedTotalWeight > 0
            ? (bungalovPricing.discountedTotal * w) / projectedTotalWeight
            : 0;
        bungalovGroupTotal += dayPrice / fams;
      }
      const avgFams = dayCount > 0 ? Math.round(famSum / dayCount) : 1;
      totalBungalov += bungalovGroupTotal;

      // Simuni per-person cost for this group (non-pavšal attendees only).
      const seasonObj = seasonName
        ? (settings.seasons.find((s) => seasonLabel(s) === seasonName) ?? null)
        : null;
      const personRows: EstimatePersonRow[] = [];
      if (seasonObj) {
        for (const person of selectedPersons) {
          if (person.naPausalu) continue;
          const band = ageBand(computeAge(person.birthday));
          const nightlyPrice = seasonPriceForBand(seasonObj, band);
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

      const taxTotal = taxPayerCount * dayCount * settings.touristTax;
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

    const accommodationFee = accommodationFeeTotal(settings, selectedPersons.length);
    const simuni = totalSimuniPersons + totalSimuniTax + accommodationFee;

    return {
      label: formatDayRange(startKey, endKey),
      selectedDays: selectedDays.length,
      overlappingFamilies,
      seasonGroups,
      bungalovPausal: settings.pausalPrice,
      bungalovDiscountPercent: settings.oneoffDiscountPercent,
      bungalovDiscountAmount: settings.pausalPrice * (settings.oneoffDiscountPercent / 100),
      bungalovDiscountedTotal: bungalovPricing.discountedTotal,
      simuniPersons: totalSimuniPersons,
      simuniTax: totalSimuniTax,
      touristTaxPayers: taxPayerCount,
      accommodationFee,
      simuni,
      bungalov: totalBungalov,
      total: simuni + totalBungalov,
    };
  }, [
    range,
    editing,
    reservations,
    bungalovPricing,
    settings,
    maxAdult,
    selectedPersonIds,
    availablePersons,
  ]);

  function openCreate() {
    setEditing(null);
    setRange(undefined);
    setSelectedUserId(currentUserId);
    setSelectedPersonIds(personsForFamily(currentUserId).map((person) => person.id));
    setSelectedCarIds([]);
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(reservation: Reservation) {
    setEditing(reservation);
    setRange({
      from: parseDayKey(reservation.startDay),
      to: parseDayKey(reservation.endDay),
    });
    setSelectedUserId(reservation.userId);
    setSelectedPersonIds(reservation.persons.map((person) => person.id));
    setSelectedCarIds(reservation.cars.map((car) => car.id));
    setFormError(null);
    setModalOpen(true);
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
    setModalOpen(false);
  }

  async function handleSave() {
    if (!range?.from) return;
    const end = range.to ?? range.from;
    const input: ReservationRangeInput = {
      startDay: toDayKey(range.from),
      endDay: toDayKey(end),
      personIds: selectedPersonIds,
      carIds: selectedCarIds,
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
      setModalOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Napaka pri shranjevanju.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!editing) return;
    setSaving(true);
    setFormError(null);
    try {
      await onDeleteReservation(editing.id);
      setModalOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Napaka pri brisanju.');
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
              onClick={() => setFilterYear(null)}
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
                onClick={() => setFilterYear(year)}
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
              onClick={() => setFilterFamilyId(null)}
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
                onClick={() => setFilterFamilyId(family.id)}
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
            {/* ── Mobile card list (< sm) ─────────────────────────────── */}
            <div className="space-y-2 sm:hidden">
              {filteredLines.map(({ reservation, days, breakdown }) => {
                const expanded = expandedId === reservation.id;
                return (
                  <CardRow key={reservation.id}>
                    <div className="flex items-start justify-between gap-2 px-3 py-3">
                      <div>
                        <p className="font-medium text-brand-dark">
                          {formatDayRange(reservation.startDay, reservation.endDay)}
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
                    <div className="grid grid-cols-3 divide-x divide-brand/10 border-t border-brand/10">
                      <div className="px-3 py-2">
                        <p className="text-[10px] uppercase tracking-wide text-brand/50">Šimuni</p>
                        <p className="text-sm font-medium text-brand-dark">
                          {formatEur(breakdown.simuni)}
                        </p>
                      </div>
                      <div className="px-3 py-2">
                        <p className="text-[10px] uppercase tracking-wide text-brand/50">
                          Bungalov
                        </p>
                        <p className="text-sm font-semibold text-brand-dark">
                          {formatEur(breakdown.bungalov)}
                        </p>
                      </div>
                      <div className="px-3 py-2">
                        <p className="text-[10px] uppercase tracking-wide text-brand/50">Skupaj</p>
                        <p className="text-sm font-semibold text-brand">
                          {formatEur(breakdown.total)}
                        </p>
                      </div>
                    </div>
                    {expanded && (
                      <div className="border-t border-brand/10 px-3 pb-3 pt-2">
                        <ReservationBreakdown
                          breakdown={breakdown}
                          touristTax={settings.touristTax}
                          accommodationFeeRate={settings.accommodationFee}
                          touristTaxExemptAge={settings.touristTaxExemptAge}
                        />
                      </div>
                    )}
                  </CardRow>
                );
              })}

              {/* Mobile totals row */}
              <div className="grid grid-cols-3 divide-x divide-brand/15 rounded-xl border border-brand/15 bg-sky/40">
                <div className="px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-brand/50">Šimuni</p>
                  <p className="text-sm font-semibold text-brand-dark">
                    {formatEur(totals.simuni)}
                  </p>
                </div>
                <div className="px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-brand/50">Bungalov</p>
                  <p className="text-sm font-bold text-brand">{formatEur(totals.bungalov)}</p>
                </div>
                <div className="px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-brand/50">Skupaj</p>
                  <p className="text-sm font-semibold text-brand-dark">{formatEur(totals.total)}</p>
                </div>
              </div>

              <p className="text-xs text-brand/60">
                Med družine se deli samo najemnina za bungalov. „Za plačati Šimuni“ vključuje ceno
                na osebo za tiste, ki niso na pavšalu, turistično takso in enkratno plačilo
                nastanitve.
              </p>
            </div>

            {/* ── Desktop table (sm+) ─────────────────────────────────── */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full table-fixed text-sm">
                <colgroup>
                  {/* Only this column is flexible; the rest are fixed px so the
                      row content (e.g. the expanded breakdown) or the container's
                      own width (e.g. a scrollbar toggling) can never resize them. */}
                  <col />
                  <col className="w-37.5" />
                  <col className="w-37.5" />
                  <col className="w-37.5" />
                  <col className="w-22.5" />
                </colgroup>
                <thead>
                  <tr className="border-b border-brand/10 text-left text-xs uppercase tracking-wide text-brand/60">
                    <th className="py-2 pr-3 font-medium">Obdobje</th>
                    <th className="py-2 px-3 text-right font-medium">Za plačati Šimuni</th>
                    <th className="py-2 px-3 text-right font-medium">Za plačati bungalov</th>
                    <th className="py-2 px-3 text-right font-medium">Skupaj</th>
                    <th className="py-2 pl-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand/10">
                  {filteredLines.map(({ reservation, days, breakdown }) => {
                    const expanded = expandedId === reservation.id;
                    return (
                      <Fragment key={reservation.id}>
                        <tr className="align-middle">
                          <td className="py-2.5 pr-3">
                            <p className="font-medium text-brand-dark">
                              {formatDayRange(reservation.startDay, reservation.endDay)}
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
                          <td className="whitespace-nowrap py-2.5 px-3 text-right font-semibold text-brand-dark">
                            {formatEur(breakdown.bungalov)}
                          </td>
                          <td className="whitespace-nowrap py-2.5 px-3 text-right font-semibold text-brand-dark">
                            {formatEur(breakdown.total)}
                          </td>
                          <td className="py-2.5 pl-3">
                            <div className="flex items-center justify-end gap-1">
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
                            <td colSpan={5} className="pb-3 pt-1">
                              <ReservationBreakdown
                                breakdown={breakdown}
                                touristTax={settings.touristTax}
                                accommodationFeeRate={settings.accommodationFee}
                                touristTaxExemptAge={settings.touristTaxExemptAge}
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
                    <td className="whitespace-nowrap py-3 px-3 text-right text-lg font-bold text-brand">
                      {formatEur(totals.bungalov)}
                    </td>
                    <td className="whitespace-nowrap py-3 px-3 text-right font-semibold text-brand-dark">
                      {formatEur(totals.total)}
                    </td>
                    <td className="py-3 pl-3" />
                  </tr>
                </tfoot>
              </table>
              <p className="mt-3 text-xs text-brand/60">
                Med družine se deli samo najemnina za bungalov. „Za plačati Šimuni“ vključuje ceno
                na osebo za tiste, ki niso na pavšalu, turistično takso in enkratno plačilo
                nastanitve.
              </p>
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
                  onClick={handleDelete}
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
                  <label
                    key={person.id}
                    className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors ${
                      checked
                        ? 'border-brand bg-brand/5 text-brand-dark'
                        : 'border-brand/15 bg-white text-brand-dark/80 hover:border-brand/30'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => togglePerson(person.id)}
                      disabled={saving}
                      className="h-4 w-4 rounded border-brand/30 text-brand focus:ring-brand"
                    />
                    {child ? (
                      <Baby size={15} className="text-brand/70" aria-hidden />
                    ) : (
                      <UserIcon size={15} className="text-brand/70" aria-hidden />
                    )}
                    <span className="flex-1 truncate font-medium">{person.name}</span>
                    {age !== null && <span className="text-xs text-brand/50">{age} let</span>}
                  </label>
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
                  <label
                    key={car.id}
                    className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors ${
                      checked
                        ? 'border-brand bg-brand/5 text-brand-dark'
                        : 'border-brand/15 bg-white text-brand-dark/80 hover:border-brand/30'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleCar(car.id)}
                      disabled={saving}
                      className="h-4 w-4 rounded border-brand/30 text-brand focus:ring-brand"
                    />
                    <CarIcon size={15} className="text-brand/70" aria-hidden />
                    <span className="flex-1 truncate font-medium">{car.name}</span>
                    {car.registrationPlate && (
                      <span className="text-xs text-brand/50">{car.registrationPlate}</span>
                    )}
                  </label>
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
                      {nightCountLabel(group.days)} x {formatEur(group.bungalovTotal / group.days)}
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
                          {formatEur(settings.touristTax)}
                          {selectionEstimate.touristTaxPayers < selectedPersonIds.length &&
                            ` (otroci do ${settings.touristTaxExemptAge} let brez takse)`}
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
                          {selectedPersonIds.length} os. × {formatEur(settings.accommodationFee)}
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
              <div className="flex justify-between text-xs text-brand/70">
                <span>Za plačati bungalov</span>
                <span className="font-medium text-brand-dark">
                  {formatEur(selectionEstimate.bungalov)}
                </span>
              </div>
              <div className="flex justify-between font-bold text-brand">
                <span>Skupaj ocena</span>
                <span className="text-lg">{formatEur(selectionEstimate.total)}</span>
              </div>
              <p className="text-[10px] text-brand/50">
                Bungalov se deli med vse družine prisotne ta dan.
              </p>
            </div>
          </CardSection>
        ) : (
          <AlertBox variant="info" className="mt-4">
            Izberi obdobje za oceno cene.
          </AlertBox>
        )}

        {formError && <AlertBox className="mt-3">{formError}</AlertBox>}
      </Modal>
    </div>
  );
}
