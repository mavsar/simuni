import { computeAge, eachNightKeyInRange, parseDayKey } from './dates';
import type { Person, Season, Settings } from './types';

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

export type BungalovPricing = {
  /** Total rent (discounted pavšal) that all occupied days together cover. */
  discountedTotal: number;
  /** Peak-season adult price used as the discount baseline. */
  maxAdult: number;
  /** Sum of every occupied day's weight. */
  totalWeight: number;
  /** Season weight for a given day. */
  weightForDay: (dayKey: string) => number;
  /** Full price for a day before splitting between families. */
  priceForDay: (dayKey: string) => number;
};

/**
 * Spreads the fixed (discounted) pavšal across the occupied days, weighting each
 * day by its season. The total across all days still equals the pavšal, but
 * peak-season days carry a larger share and off-season days a smaller one.
 */
export function computeBungalovPricing(
  settings: Settings,
  occupiedDays: Iterable<string>
): BungalovPricing {
  const discountedTotal = computePricing(settings, 0).discountedTotal;
  const maxAdult = maxAdultPrice(settings.seasons);

  const weights = new Map<string, number>();
  let totalWeight = 0;
  for (const day of occupiedDays) {
    const weight = dayWeight(settings.seasons, maxAdult, day);
    weights.set(day, weight);
    totalWeight += weight;
  }

  const weightForDay = (dayKey: string) =>
    weights.get(dayKey) ?? dayWeight(settings.seasons, maxAdult, dayKey);

  const priceForDay = (dayKey: string) =>
    totalWeight > 0 ? (discountedTotal * weightForDay(dayKey)) / totalWeight : 0;

  return { discountedTotal, maxAdult, totalWeight, weightForDay, priceForDay };
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
