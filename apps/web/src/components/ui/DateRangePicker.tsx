import { useMemo, useState } from 'react';
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
  /** Formats a date for the "Od"/"Do" fields above the calendar. */
  formatFieldLabel?: (date: Date) => string;
};

type ActiveField = 'from' | 'to' | null;

/** `12. 7. 2026` — day, month and year, Slovenian-style. */
function defaultFormatFieldLabel(date: Date): string {
  return `${date.getDate()}. ${date.getMonth() + 1}. ${date.getFullYear()}`;
}

type DateFieldProps = {
  label: string;
  value?: Date;
  active: boolean;
  onClick: () => void;
  formatLabel: (date: Date) => string;
};

/** One of the "Od" / "Do" boxes above the calendar. Click it, then click a day. */
function DateField({ label, value, active, onClick, formatLabel }: DateFieldProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-1 flex-col items-start gap-0.5 rounded-xl border px-3 py-1.5 text-left transition-colors',
        active
          ? 'border-brand bg-brand/5 ring-2 ring-brand/30'
          : 'border-brand/20 hover:border-brand/50'
      )}
    >
      <span className="text-[11px] font-medium uppercase tracking-wide text-brand/50">
        {label}
      </span>
      <span className={cn('text-sm', value ? 'text-brand-dark' : 'text-brand/40')}>
        {value ? formatLabel(value) : 'Izberi datum'}
      </span>
    </button>
  );
}

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
 * Shared range date picker built on react-day-picker, with "Od"/"Do" fields
 * above the calendar. Click a field to arm it, then click a day to set it —
 * or skip the fields and just click a start day then an end day as before.
 * Localized to Slovenian with a Monday-first week to match the rest of the
 * app.
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
  occupancy,
  formatFieldLabel = defaultFormatFieldLabel
}: DateRangePickerProps) {
  const [activeField, setActiveField] = useState<ActiveField>(null);

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

  function toggleField(field: 'from' | 'to') {
    setActiveField((current) => (current === field ? null : field));
  }

  function handleSelect(range: DateRange | undefined, triggerDate: Date) {
    if (activeField === 'from') {
      const to = value?.to && value.to < triggerDate ? undefined : value?.to;
      onChange({ from: triggerDate, to });
      setActiveField('to');
      return;
    }
    if (activeField === 'to') {
      const from = value?.from;
      onChange(
        from && triggerDate < from ? { from: triggerDate, to: from } : { from, to: triggerDate }
      );
      setActiveField(null);
      return;
    }
    onChange(range);
  }

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex items-center gap-2">
        <DateField
          label="Od"
          value={value?.from}
          active={activeField === 'from'}
          onClick={() => toggleField('from')}
          formatLabel={formatFieldLabel}
        />
        <span className="text-brand/40" aria-hidden>
          –
        </span>
        <DateField
          label="Do"
          value={value?.to}
          active={activeField === 'to'}
          onClick={() => toggleField('to')}
          formatLabel={formatFieldLabel}
        />
      </div>
      <DayPicker
        mode="range"
        locale={sl}
        weekStartsOn={1}
        numberOfMonths={numberOfMonths}
        defaultMonth={defaultMonth}
        selected={value}
        onSelect={handleSelect}
        disabled={disabled}
        excludeDisabled
        showOutsideDays
        components={components}
        className="rdp-simuni"
      />
    </div>
  );
}
