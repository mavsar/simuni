import { useMemo } from 'react';
import { sl } from 'react-day-picker/locale';
import { DayPicker, type DateRange, type DayButtonProps } from 'react-day-picker';

import 'react-day-picker/style.css';
import { cn } from '../../lib/utils';

export type { DateRange };

export type DateRangePickerProps = {
  /** Currently selected range (start/end). */
  value?: DateRange;
  onChange: (range: DateRange | undefined) => void;
  /** Disable selecting days before this date. Defaults to today. */
  fromDate?: Date;
  /** When false, past days can be selected (e.g. admins). Defaults to true. */
  disablePast?: boolean;
  /** Individual days that cannot be selected (e.g. already-reserved days). */
  disabledDays?: Date[];
  /** Month shown first when the picker opens. */
  defaultMonth?: Date;
  /** How many months to render side by side. Defaults to 2. */
  numberOfMonths?: number;
  className?: string;
  /**
   * Map from YYYY-MM-DD to the number of distinct families with a reservation
   * on that day. When provided, a row of dots is rendered below each occupied
   * day's number — one dot per family, up to a maximum of 5.
   */
  occupancy?: Map<string, number>;
};

/** Formats a local Date to YYYY-MM-DD without timezone conversion. */
function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function OccupancyDayButton({
  occupancy,
  day,
  children,
  ...buttonProps
}: DayButtonProps & { occupancy: Map<string, number> }) {
  const count = occupancy.get(localDayKey(day.date)) ?? 0;

  return (
    <button {...buttonProps} style={{ position: 'relative', ...buttonProps.style }}>
      {children}
      {count > 0 && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            bottom: 3,
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
            gap: 2,
            pointerEvents: 'none'
          }}
        >
          {Array.from({ length: Math.min(count, 5) }, (_, i) => (
            <span
              key={i}
              style={{
                width: 4,
                height: 4,
                borderRadius: '50%',
                backgroundColor: 'rgba(16, 85, 181, 0.55)'
              }}
            />
          ))}
        </span>
      )}
    </button>
  );
}

/**
 * Shared range date picker built on react-day-picker. Selection is done by
 * clicking the start day and then the end day (no dragging). Localized to
 * Slovenian with a Monday-first week to match the rest of the app.
 */
export function DateRangePicker({
  value,
  onChange,
  fromDate,
  disablePast = true,
  disabledDays,
  defaultMonth,
  numberOfMonths = 2,
  className,
  occupancy
}: DateRangePickerProps) {
  const disabled = [
    ...(disablePast ? [{ before: fromDate ?? new Date() }] : []),
    ...(disabledDays ?? [])
  ];

  const components = useMemo(() => {
    if (!occupancy) return undefined;
    return {
      DayButton: (props: DayButtonProps) => (
        <OccupancyDayButton {...props} occupancy={occupancy} />
      )
    };
  }, [occupancy]);

  return (
    <DayPicker
      mode="range"
      locale={sl}
      weekStartsOn={1}
      numberOfMonths={numberOfMonths}
      defaultMonth={defaultMonth}
      selected={value}
      onSelect={onChange}
      disabled={disabled}
      excludeDisabled
      showOutsideDays
      components={components}
      className={cn('rdp-simuni', className)}
    />
  );
}
