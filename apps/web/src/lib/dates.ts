export const SL_MONTHS = [
  'Januar',
  'Februar',
  'Marec',
  'April',
  'Maj',
  'Junij',
  'Julij',
  'Avgust',
  'September',
  'Oktober',
  'November',
  'December'
];

/** Weekday short labels, Monday-first to match the calendar grid. */
export const SL_WEEKDAYS_SHORT = ['Pon', 'Tor', 'Sre', 'Čet', 'Pet', 'Sob', 'Ned'];

/** Format a local date as a `YYYY-MM-DD` key (no timezone shifting). */
export function toDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Parse a `YYYY-MM-DD` key into a local Date (midnight, no timezone shift). */
export function parseDayKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** All day-keys from `startKey` to `endKey` inclusive. */
export function eachDayKeyInRange(startKey: string, endKey: string): string[] {
  const keys: string[] = [];
  const cursor = parseDayKey(startKey);
  const last = parseDayKey(endKey);
  while (cursor <= last) {
    keys.push(toDayKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

/** Inclusive number of days between two day-keys. */
export function dayCountInRange(startKey: string, endKey: string): number {
  const start = parseDayKey(startKey).getTime();
  const end = parseDayKey(endKey).getTime();
  return Math.round((end - start) / 86_400_000) + 1;
}

/** Human range label, e.g. `12. 7. – 20. 7. 2026` (Slovenian). */
export function formatDayRange(startKey: string, endKey: string): string {
  const start = parseDayKey(startKey);
  const end = parseDayKey(endKey);
  const startLabel = `${start.getDate()}. ${start.getMonth() + 1}.`;
  const endLabel = `${end.getDate()}. ${end.getMonth() + 1}. ${end.getFullYear()}`;
  if (startKey === endKey) {
    return endLabel;
  }
  return `${startLabel} – ${endLabel}`;
}

/** Index (0=Mon … 6=Sun) of the first day of the given month. */
export function mondayFirstOffset(year: number, month: number): number {
  const jsDay = new Date(year, month, 1).getDay();
  return (jsDay + 6) % 7;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** A person at or below this age (in years) counts as a child. */
export const CHILD_MAX_AGE = 17;

/** Whole years between a `YYYY-MM-DD` birthday and today, or null if invalid. */
export function computeAge(birthday: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthday)) return null;
  const birth = parseDayKey(birthday);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age < 0 ? null : age;
}

/** Whether the given birthday belongs to a child (≤ {@link CHILD_MAX_AGE}). */
export function isChild(birthday: string): boolean {
  const age = computeAge(birthday);
  return age !== null && age <= CHILD_MAX_AGE;
}
