import { Baby, ChevronLeft, ChevronRight, User as UserIcon } from 'lucide-react';
import { Fragment, useMemo, useState, type ReactNode } from 'react';

import {
  SL_MONTHS,
  SL_WEEKDAYS_SHORT,
  daysInMonth,
  eachDayKeyInRange,
  isChild,
  isSameDay,
  mondayFirstOffset,
  toDayKey
} from '../lib/dates';
import type { Reservation } from '../lib/types';
import { cn } from '../lib/utils';
import { Button } from './ui/Button';
import { Tooltip } from './ui/Tooltip';

export type CalendarProps = {
  reservations: Reservation[];
  currentUserId: number;
  /** When true, every reservation is editable (admins). */
  canEditAll?: boolean;
  /** Full (season-weighted) bungalov price for a day, before the family split. */
  priceForDay: (dayKey: string) => number;
  formatPrice: (amount: number) => string;
  /** Called when a user clicks a day belonging to an editable reservation. */
  onEditReservation: (reservation: Reservation) => void;
};

type Cell = { key: string; date: Date } | null;

type DayAttendee = { name: string; child: boolean };

/** One family present on a given day, with its own attendees. */
type FamilyGroup = {
  userId: number;
  family: string;
  adults: number;
  children: number;
  attendees: DayAttendee[];
  mine: boolean;
  reservation: Reservation;
};

/** Occupancy for a single day, broken down per family. */
type DayInfo = {
  groups: FamilyGroup[];
  mine: boolean;
};

/** Slovenian count label for families, e.g. "2 družini", "5 družin". */
function familyCountLabel(count: number): string {
  if (count === 1) return '1 družina';
  if (count === 2) return '2 družini';
  if (count === 3 || count === 4) return `${count} družine`;
  return `${count} družin`;
}

/** Builds the hover content listing who is coming for a single family. */
function attendeesTooltip(attendees: DayAttendee[]): ReactNode {
  if (attendees.length === 0) return null;
  return (
    <ul className="space-y-0.5">
      {attendees.map((attendee, index) => (
        <li key={index} className="flex items-center gap-1.5">
          {attendee.child ? <Baby size={12} aria-hidden /> : <UserIcon size={12} aria-hidden />}
          <span>{attendee.name}</span>
        </li>
      ))}
    </ul>
  );
}

function buildCells(year: number, month: number): Cell[] {
  const offset = mondayFirstOffset(year, month);
  const total = daysInMonth(year, month);
  const cells: Cell[] = [];

  for (let i = 0; i < offset; i += 1) {
    cells.push(null);
  }
  for (let day = 1; day <= total; day += 1) {
    const date = new Date(year, month, day);
    cells.push({ key: toDayKey(date), date });
  }
  return cells;
}

export function Calendar({
  reservations,
  currentUserId,
  canEditAll = false,
  priceForDay,
  formatPrice,
  onEditReservation
}: CalendarProps) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const dayInfo = useMemo(() => {
    const map = new Map<string, Map<number, FamilyGroup>>();
    for (const reservation of reservations) {
      for (const day of eachDayKeyInRange(reservation.startDay, reservation.endDay)) {
        let groups = map.get(day);
        if (!groups) {
          groups = new Map();
          map.set(day, groups);
        }
        let group = groups.get(reservation.userId);
        if (!group) {
          group = {
            userId: reservation.userId,
            family: reservation.ownerName,
            adults: 0,
            children: 0,
            attendees: [],
            mine: reservation.userId === currentUserId,
            reservation
          };
          groups.set(reservation.userId, group);
        }
        for (const person of reservation.persons) {
          const child = isChild(person.birthday);
          if (child) group.children += 1;
          else group.adults += 1;
          group.attendees.push({ name: person.name, child });
        }
      }
    }

    const result = new Map<string, DayInfo>();
    for (const [day, groups] of map) {
      const list = [...groups.values()];
      result.set(day, { groups: list, mine: list.some((group) => group.mine) });
    }
    return result;
  }, [reservations, currentUserId]);

  function goToPrevMonth() {
    setViewMonth((prev) => {
      if (prev === 0) {
        setViewYear((year) => year - 1);
        return 11;
      }
      return prev - 1;
    });
  }

  function goToNextMonth() {
    setViewMonth((prev) => {
      if (prev === 11) {
        setViewYear((year) => year + 1);
        return 0;
      }
      return prev + 1;
    });
  }

  const cells = buildCells(viewYear, viewMonth);

  /** Reservation to open when a day is clicked: prefer the user's own. */
  function editTarget(info: DayInfo): Reservation | null {
    const mine = info.groups.find((group) => group.mine);
    if (mine) return mine.reservation;
    if (canEditAll) return info.groups[0]?.reservation ?? null;
    return null;
  }

  return (
    <div className="rounded-2xl bg-white/90 p-4 shadow-sm ring-1 ring-brand/10 backdrop-blur-sm sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <Button
          variant="transparent"
          color="brand"
          size="icon"
          onClick={goToPrevMonth}
          aria-label="Prejšnji mesec"
          icon={ChevronLeft}
          className="rounded-full text-brand"
        />
        <h2 className="text-lg font-semibold text-brand-dark">
          {SL_MONTHS[viewMonth]} {viewYear}
        </h2>
        <Button
          variant="transparent"
          color="brand"
          size="icon"
          onClick={goToNextMonth}
          aria-label="Naslednji mesec"
          icon={ChevronRight}
          className="rounded-full text-brand"
        />
      </div>

      <div className="mb-2 grid grid-cols-7 gap-1.5">
        {SL_WEEKDAYS_SHORT.map((label) => (
          <div
            key={label}
            className="py-1 text-center text-xs font-medium uppercase tracking-wide text-brand/60"
          >
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((cell, index) => {
          if (!cell) {
            return <div key={`empty-${index}`} aria-hidden />;
          }

          const info = dayInfo.get(cell.key);
          const isToday = isSameDay(cell.date, today);

          if (info) {
            const mine = info.mine;
            const target = editTarget(info);
            const familiesCount = info.groups.length;
            const dayPrice = priceForDay(cell.key);
            const share = familiesCount > 0 ? dayPrice / familiesCount : dayPrice;
            const ownerLabel =
              familiesCount > 1
                ? familyCountLabel(familiesCount)
                : (info.groups[0]?.family ?? '');

            const divider = <span className="my-0.5 h-px w-3/4 bg-current opacity-25" aria-hidden />;

            const content = (
              <>
                {familiesCount > 1 && (
                  <span className="absolute right-1 top-0.5 rounded-full bg-black/10 px-1 text-[9px] font-bold leading-tight">
                    {familiesCount}×
                  </span>
                )}
                <span className="font-semibold leading-none">{cell.date.getDate()}</span>
                {divider}
                {info.groups.map((group, groupIndex) => (
                  <Fragment key={group.userId}>
                    {groupIndex > 0 && divider}
                    <span className="flex w-full flex-col items-center gap-0.5 leading-tight">
                      <span className="w-full truncate px-0.5 text-center text-[10px] font-medium">
                        {group.family}
                      </span>
                      {(group.adults > 0 || group.children > 0) && (
                        <Tooltip content={attendeesTooltip(group.attendees)}>
                          <span className="inline-flex cursor-default items-center justify-center gap-1 text-[10px] font-medium">
                            {group.adults > 0 && (
                              <span className="inline-flex items-center gap-0.5">
                                <UserIcon size={11} aria-hidden />
                                {group.adults}
                              </span>
                            )}
                            {group.children > 0 && (
                              <span className="inline-flex items-center gap-0.5">
                                <Baby size={11} aria-hidden />
                                {group.children}
                              </span>
                            )}
                          </span>
                        </Tooltip>
                      )}
                      <span className="text-[10px] font-medium">{formatPrice(share)}</span>
                    </span>
                  </Fragment>
                ))}
              </>
            );

            const colorClasses = mine
              ? 'border-brand bg-brand text-white shadow-sm'
              : 'border-sand bg-sand/70 text-brand-dark/80';

            if (target) {
              return (
                <button
                  key={cell.key}
                  type="button"
                  onClick={() => onEditReservation(target)}
                  title={`Uredi rezervacijo${ownerLabel ? ` – ${ownerLabel}` : ''}`}
                  className={cn(
                    'group relative flex aspect-square flex-col items-center justify-center gap-0.5 rounded-xl border p-1 text-sm transition-all',
                    colorClasses,
                    mine ? 'hover:bg-brand-dark' : 'hover:border-brand/40 hover:brightness-105',
                    isToday && (mine ? 'ring-2 ring-white/70' : 'ring-2 ring-brand/40')
                  )}
                >
                  {content}
                </button>
              );
            }

            return (
              <div
                key={cell.key}
                title={`Zasedeno${ownerLabel ? ` – ${ownerLabel}` : ''}`}
                className={cn(
                  'relative flex aspect-square flex-col items-center justify-center gap-0.5 rounded-xl border p-1 text-sm',
                  colorClasses,
                  isToday && (mine ? 'ring-2 ring-white/70' : 'ring-2 ring-brand/40')
                )}
              >
                {content}
              </div>
            );
          }

          return (
            <div
              key={cell.key}
              className={cn(
                'relative flex aspect-square flex-col items-center justify-center rounded-xl border border-transparent bg-sky/60 text-sm text-brand-dark',
                isToday && 'ring-2 ring-brand/40'
              )}
            >
              <span className="font-semibold leading-none">{cell.date.getDate()}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
