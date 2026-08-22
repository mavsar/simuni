import { computeAge, eachNightKeyInRange, parseDayKey } from './dates';
import type { Person, Reservation, Season, Settings } from './types';

/** Earliest year the app prices. Mirrors MIN_SETTINGS_YEAR on the server. */
export const MIN_SETTINGS_YEAR = 2026;

/** The calendar year of a `YYYY-MM-DD` key. */
export function yearOfDay(dayKey: string): number {
  return Number(dayKey.slice(0, 4));
}

/** A reservation's amounts frozen when its year's prices were confirmed. */
export type ReservationPriceSnapshot = {
  reservationId: number;
  bungalov: number;
  simuni: number;
};

/** One calendar year's pricing settings. */
export type YearSettings = Settings & {
  year: number;
  /** True once an admin has locked this year's prices. */
  pricesConfirmed: boolean;
  pricesConfirmedAt: string | null;
  /** False while the values are inherited from another year and unsaved. */
  stored: boolean;
  updatedAt: string | null;
  /** Frozen amounts per reservation, populated only once confirmed. */
  snapshots: ReservationPriceSnapshot[];
};

function emptyYearSettings(year: number): YearSettings {
  return {
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
    seasons: [],
    snapshots: []
  };
}

/** Resolves a year to its settings, inheriting from a neighbouring year when missing. */
export type YearSettingsLookup = (year: number) => YearSettings;

/**
 * Wraps the years the server returned in a lookup that never misses. The
 * server already synthesises the configurable window (2026 … next year);
 * this covers everything outside it — e.g. a reservation in a year nobody
 * has priced — by inheriting the nearest earlier year, then the earliest
 * known one.
 *
 * The returned function memoises, so the object it hands back for a given
 * year is referentially stable for as long as `years` is. SettingsPage
 * relies on that to avoid clobbering in-progress edits on unrelated
 * re-renders.
 */
export function buildYearSettingsLookup(years: YearSettings[]): YearSettingsLookup {
  const sorted = [...years].sort((a, b) => a.year - b.year);
  const byYear = new Map(sorted.map((entry) => [entry.year, entry]));
  const cache = new Map<number, YearSettings>();

  return (year: number): YearSettings => {
    const exact = byYear.get(year);
    if (exact) return exact;

    const cached = cache.get(year);
    if (cached) return cached;

    let inherited: YearSettings | undefined;
    for (const entry of sorted) {
      if (entry.year > year) break;
      inherited = entry;
    }
    const source = inherited ?? sorted[0];
    const value: YearSettings = source
      ? {
          ...source,
          year,
          pricesConfirmed: false,
          pricesConfirmedAt: null,
          stored: false,
          snapshots: []
        }
      : emptyYearSettings(year);

    cache.set(year, value);
    return value;
  };
}

/** The frozen amount for a reservation, once its year is confirmed — or null while open. */
export function snapshotForReservation(
  yearSettings: YearSettings,
  reservationId: number
): ReservationPriceSnapshot | null {
  if (!yearSettings.pricesConfirmed) return null;
  return yearSettings.snapshots.find((s) => s.reservationId === reservationId) ?? null;
}

export type PricingSummary = {
  /** Yearly rent before discount. */
  pausalPrice: number;
  /** Discount percent for the one-time payment. */
  oneoffDiscountPercent: number;
  /** Absolute amount saved by the discount. */
  discountAmount: number;
  /** What actually needs to be covered: pavšal minus the discount. */
  discountedTotal: number;
  /** How many days are currently occupied. */
  occupiedCount: number;
  /** Price for a single occupied day (discountedTotal / occupiedCount). */
  pricePerDay: number;
};

/**
 * The goal is that renting the bungalov covers the full (discounted) pavšal.
 * Every occupied day therefore carries an equal share of that total, so a
 * single occupied day costs the whole amount, ten occupied days cost a tenth
 * each, and so on.
 */
export function computePricing(settings: Settings, occupiedCount: number): PricingSummary {
  const discountAmount = settings.pausalPrice * (settings.oneoffDiscountPercent / 100);
  const discountedTotal = settings.pausalPrice - discountAmount;
  const pricePerDay = occupiedCount > 0 ? discountedTotal / occupiedCount : 0;

  return {
    pausalPrice: settings.pausalPrice,
    oneoffDiscountPercent: settings.oneoffDiscountPercent,
    discountAmount,
    discountedTotal,
    occupiedCount,
    pricePerDay
  };
}

/** Age bands that map a person's age to a season price column. */
export type AgeBand =
  | 'child0_2'
  | 'child3_5'
  | 'child6_11'
  | 'adult'
  | 'adultSenior';

/** Maps an age (in years) to the matching season price band. */
export function ageBand(age: number | null): AgeBand {
  if (age === null) return 'adult';
  if (age <= 2) return 'child0_2';
  if (age <= 5) return 'child3_5';
  if (age <= 11) return 'child6_11';
  if (age >= 60) return 'adultSenior';
  return 'adult';
}

/** The nightly price for a given age band within a season. */
export function seasonPriceForBand(season: Season, band: AgeBand): number {
  switch (band) {
    case 'child0_2':
      return season.priceChild0_2;
    case 'child3_5':
      return season.priceChild3_5;
    case 'child6_11':
      return season.priceChild6_11;
    case 'adultSenior':
      return season.priceAdultSenior;
    case 'adult':
    default:
      return season.priceAdult;
  }
}

/**
 * Finds the season covering a `YYYY-MM-DD` day. Seasons are matched on month/day
 * (start and end inclusive) so they recur every year, and ranges that wrap past
 * the year boundary (e.g. December into January) are handled. Seasons are written
 * so they don't overlap — one season ends the day before the next begins — so a
 * day belongs to exactly one season. The first season in order that matches wins.
 */
export function seasonForDay(seasons: Season[], dayKey: string): Season | null {
  const date = parseDayKey(dayKey);
  const value = (date.getMonth() + 1) * 100 + date.getDate();
  for (const season of seasons) {
    const start = season.startMonth * 100 + season.startDay;
    const end = season.endMonth * 100 + season.endDay;
    const inRange =
      start <= end ? value >= start && value <= end : value >= start || value <= end;
    if (inRange) return season;
  }
  return null;
}

/**
 * Human label for a season's recurring period, e.g. `15.03.–24.04.`. Derived
 * from the start/end month and day so it always matches the actual dates.
 */
export function seasonLabel(
  season: Pick<Season, 'startMonth' | 'startDay' | 'endMonth' | 'endDay'>
): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(season.startDay)}.${pad(season.startMonth)}.–${pad(season.endDay)}.${pad(
    season.endMonth
  )}.`;
}

/** The highest adult nightly price across all seasons — the discount baseline. */
export function maxAdultPrice(seasons: Season[]): number {
  return seasons.reduce((max, season) => Math.max(max, season.priceAdult), 0);
}

/**
 * Discount percent for a season, derived from how much cheaper its adult price
 * is compared to the most expensive (peak) season. The peak season is the base
 * at 0 %; cheaper seasons get a proportionally larger discount.
 */
export function seasonDiscountPercent(season: Season, maxAdult: number): number {
  if (maxAdult <= 0) return 0;
  return (1 - season.priceAdult / maxAdult) * 100;
}

/**
 * Relative weight a day carries when splitting the bungalov rent. Peak-season
 * days weigh 1; cheaper seasons weigh less, so they shoulder a smaller share of
 * the (fixed) total. Days outside any season fall back to the full weight.
 */
export function dayWeight(seasons: Season[], maxAdult: number, dayKey: string): number {
  if (maxAdult <= 0) return 1;
  const season = seasonForDay(seasons, dayKey);
  if (!season) return 1;
  return season.priceAdult / maxAdult;
}

/** One calendar year's share pool: its rent, its baseline, its occupied weight. */
export type YearPool = {
  /** The settings that priced this year — day-level lookups read from here. */
  settings: YearSettings;
  /** Discounted pavšal for this year: what its occupied days must cover. */
  discountedTotal: number;
  /** Peak-season adult price for this year, the season-discount baseline. */
  maxAdult: number;
  /** Sum of the weights of this year's occupied days. */
  totalWeight: number;
};

export type BungalovPricingByYear = {
  /**
   * Every occupied year's discounted pavšal added together. Years nobody has
   * booked contribute nothing — their rent isn't owed by anyone yet.
   */
  discountedTotal: number;
  /** Pool for one calendar year; an unbooked year has totalWeight 0. */
  poolForYear: (year: number) => YearPool;
  /** Pool for the year a `YYYY-MM-DD` day falls in. */
  poolForDay: (dayKey: string) => YearPool;
  /** Season weight of a day, within its own year's pool. */
  weightForDay: (dayKey: string) => number;
  /** Full price for a day before splitting between families. */
  priceForDay: (dayKey: string) => number;
};

/**
 * Spreads each year's own (discounted) pavšal across that year's occupied
 * days, weighting each day by that year's seasons. Years never mix: a 2027
 * night can only ever carry a share of the 2027 pavšal, so booking 2027
 * never re-prices a 2026 stay. `priceForDay` stays a flat
 * `(dayKey) => number` — it routes to the right pool internally — so the
 * calendar and the breakdown table can keep asking for any day, in any
 * year, without knowing years exist.
 */
export function computeBungalovPricingByYear(
  settingsForYear: YearSettingsLookup,
  occupiedDays: Iterable<string>
): BungalovPricingByYear {
  const pools = new Map<number, YearPool>();

  const poolForYear = (year: number): YearPool => {
    let pool = pools.get(year);
    if (!pool) {
      const settings = settingsForYear(year);
      pool = {
        settings,
        discountedTotal: computePricing(settings, 0).discountedTotal,
        maxAdult: maxAdultPrice(settings.seasons),
        totalWeight: 0
      };
      pools.set(year, pool);
    }
    return pool;
  };

  // Accumulate every occupied day's weight into its own year's pool.
  const weights = new Map<string, number>();
  const bookedYears = new Set<number>();
  for (const day of occupiedDays) {
    const year = yearOfDay(day);
    bookedYears.add(year);
    const pool = poolForYear(year);
    const weight = dayWeight(pool.settings.seasons, pool.maxAdult, day);
    weights.set(day, weight);
    pool.totalWeight += weight;
  }

  const poolForDay = (dayKey: string) => poolForYear(yearOfDay(dayKey));

  const weightForDay = (dayKey: string) => {
    const cached = weights.get(dayKey);
    if (cached !== undefined) return cached;
    const pool = poolForDay(dayKey);
    return dayWeight(pool.settings.seasons, pool.maxAdult, dayKey);
  };

  const priceForDay = (dayKey: string) => {
    const pool = poolForDay(dayKey);
    return pool.totalWeight > 0
      ? (pool.discountedTotal * weightForDay(dayKey)) / pool.totalWeight
      : 0;
  };

  // Summed over the years that actually carry bookings, so a lazily created
  // pool (asked for later by priceForDay) can never inflate the total.
  let discountedTotal = 0;
  for (const year of bookedYears) discountedTotal += poolForYear(year).discountedTotal;

  return { discountedTotal, poolForYear, poolForDay, weightForDay, priceForDay };
}

export type BreakdownDay = {
  day: string;
  seasonName: string | null;
  discountPercent: number;
  personsCost: number;
  taxCost: number;
  taxPayers: number;
  /** Tourist tax rate for this specific night's year. */
  taxRate: number;
  fams: number;
  fullBungalov: number;
  bungalovCost: number;
};

export type ReservationBreakdownData = {
  attendees: Array<{ person: Person; band: AgeBand; taxExempt: boolean }>;
  days: BreakdownDay[];
  simuniPersons: number;
  simuniTax: number;
  accommodationFee: number;
  simuni: number;
  bungalov: number;
  total: number;
  accommodationFeeRate: number;
  touristTaxExemptAge: number;
  /** True once this reservation's amounts were frozen by a price confirmation. */
  frozen: boolean;
};

/**
 * Per-day, per-reservation breakdown driving the Razpoložljivost table and its
 * expandable detail panel, for every reservation at once. Each day contributes
 * a Šimuni charge (per-person season prices for non-pavšal attendees + tourist
 * tax) and a season-weighted bungalov share split between the families present
 * that day. Per-reservation charges (accommodation fee, tax-exempt age) bill
 * under the check-in year; per-night charges (season price, tax rate,
 * bungalov share) bill under each night's own year.
 *
 * Once a year's prices are confirmed, a reservation with a stored snapshot
 * reports that frozen amount instead of recomputing it live — so a later
 * booking change in that year can never move an already-settled family's
 * bill. A reservation added after confirmation (no snapshot yet) still prices
 * live, which is correct: nothing was promised final for it.
 */
export function buildReservationBreakdowns(
  reservations: Reservation[],
  settingsForYear: YearSettingsLookup,
  bungalovPricing: BungalovPricingByYear
): Map<number, ReservationBreakdownData> {
  // For each day, how many reservations each family holds on it. A day's
  // bungalov price is split among the distinct families present; within a
  // family it is split again across that family's own (possibly overlapping)
  // reservations, so the total billed for a day never exceeds its
  // season-weighted share.
  const familyReservationsPerDay = new Map<string, Map<number, number>>();
  for (const reservation of reservations) {
    for (const day of eachNightKeyInRange(reservation.startDay, reservation.endDay)) {
      let perFamily = familyReservationsPerDay.get(day);
      if (!perFamily) {
        perFamily = new Map();
        familyReservationsPerDay.set(day, perFamily);
      }
      perFamily.set(reservation.userId, (perFamily.get(reservation.userId) ?? 0) + 1);
    }
  }

  const result = new Map<number, ReservationBreakdownData>();

  for (const reservation of reservations) {
    const yearSettings = settingsForYear(yearOfDay(reservation.startDay));

    const attendees = reservation.persons.map((person) => ({
      person,
      band: ageBand(computeAge(person.birthday)),
      taxExempt: isTouristTaxExempt(yearSettings, person.birthday)
    }));
    const taxPayerCount = touristTaxPayerCount(yearSettings, reservation.persons);

    const days: BreakdownDay[] = eachNightKeyInRange(
      reservation.startDay,
      reservation.endDay
    ).map((day) => {
      const pool = bungalovPricing.poolForDay(day);
      const daySettings = pool.settings;
      const season = seasonForDay(daySettings.seasons, day);
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
      const taxCost = taxPayerCount * daySettings.touristTax;
      const fullBungalov = bungalovPricing.priceForDay(day);

      return {
        day,
        seasonName: season ? seasonLabel(season) : null,
        discountPercent: season ? seasonDiscountPercent(season, pool.maxAdult) : 0,
        personsCost,
        taxCost,
        taxPayers: taxPayerCount,
        taxRate: daySettings.touristTax,
        fams,
        fullBungalov,
        bungalovCost: fullBungalov / fams / ownReservations
      };
    });

    const simuniPersons = days.reduce((sum, d) => sum + d.personsCost, 0);
    const simuniTax = days.reduce((sum, d) => sum + d.taxCost, 0);
    const accommodationFee = accommodationFeeTotal(yearSettings, reservation.persons.length);
    const liveBungalov = days.reduce((sum, d) => sum + d.bungalovCost, 0);
    const liveSimuni = simuniPersons + simuniTax + accommodationFee;

    const snapshot = snapshotForReservation(yearSettings, reservation.id);

    result.set(reservation.id, {
      attendees,
      days,
      simuniPersons,
      simuniTax,
      accommodationFee,
      simuni: snapshot ? snapshot.simuni : liveSimuni,
      bungalov: snapshot ? snapshot.bungalov : liveBungalov,
      total: snapshot ? snapshot.simuni + snapshot.bungalov : liveSimuni + liveBungalov,
      accommodationFeeRate: yearSettings.accommodationFee,
      touristTaxExemptAge: yearSettings.touristTaxExemptAge,
      frozen: snapshot !== null
    });
  }

  return result;
}

export type SimuniCharge = {
  /** Sum of per-person nightly season prices for non-pavšal attendees. */
  personsTotal: number;
  /** Tourist tax for all attendees across all nights. */
  taxTotal: number;
  /** One-time accommodation payment, charged once per attendee (not per night). */
  accommodationTotal: number;
  /** What the family owes Šimuni camp: persons + tax + accommodation payment. */
  total: number;
};

/** One-time accommodation payment for a reservation: charged once per attendee. */
export function accommodationFeeTotal(settings: Settings, personsCount: number): number {
  return personsCount * settings.accommodationFee;
}

/** Whether a person is too young to owe tourist tax, per {@link Settings.touristTaxExemptAge}. */
export function isTouristTaxExempt(settings: Settings, birthday: string): boolean {
  const age = computeAge(birthday);
  return age !== null && age < settings.touristTaxExemptAge;
}

/** How many of the given persons actually owe tourist tax (excludes exempt children). */
export function touristTaxPayerCount(settings: Settings, persons: Person[]): number {
  return persons.filter((person) => !isTouristTaxExempt(settings, person.birthday)).length;
}

/**
 * Computes the amount a reservation owes directly to Šimuni camp: nightly
 * per-person season prices for attendees who are NOT na pavšalu, the tourist
 * tax for every attendee old enough to owe it, and the one-time accommodation
 * payment (charged once per attendee, not per night). Nightly charges are
 * priced per night stayed (check-out day itself isn't charged), by the season
 * each night's date falls in.
 */
export function computeSimuniCharge(
  settings: Settings,
  persons: Person[],
  startDay: string,
  endDay: string
): SimuniCharge {
  const nights = eachNightKeyInRange(startDay, endDay);
  const bands = persons.map((person) => ({
    person,
    band: ageBand(computeAge(person.birthday)),
    taxExempt: isTouristTaxExempt(settings, person.birthday)
  }));

  let personsTotal = 0;
  let taxTotal = 0;

  for (const dayKey of nights) {
    const season = seasonForDay(settings.seasons, dayKey);
    for (const { person, band, taxExempt } of bands) {
      if (!taxExempt) taxTotal += settings.touristTax;
      if (!person.naPausalu && season) {
        personsTotal += seasonPriceForBand(season, band);
      }
    }
  }

  const accommodationTotal = accommodationFeeTotal(settings, persons.length);

  return {
    personsTotal,
    taxTotal,
    accommodationTotal,
    total: personsTotal + taxTotal + accommodationTotal
  };
}

const eurFormatter = new Intl.NumberFormat('sl-SI', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 2
});

export function formatEur(amount: number): string {
  return eurFormatter.format(Number.isFinite(amount) ? amount : 0);
}
