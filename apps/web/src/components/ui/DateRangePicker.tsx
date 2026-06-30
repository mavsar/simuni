import { sl } from 'react-day-picker/locale';
import { DayPicker, type DateRange } from 'react-day-picker';

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
};

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
  className
}: DateRangePickerProps) {
  const disabled = [
    ...(disablePast ? [{ before: fromDate ?? new Date() }] : []),
    ...(disabledDays ?? [])
  ];

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
      className={cn('rdp-simuni', className)}
    />
  );
}
