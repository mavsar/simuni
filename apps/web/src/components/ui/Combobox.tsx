import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState, type ComponentType, type SVGProps } from 'react';

import { cn } from '../../lib/utils';

/** Any icon component that accepts the usual lucide-style props. */
export type ComboboxIcon = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>;

export type ComboboxOption<T extends string | number> = {
  value: T;
  label: string;
  /** Optional icon shown before the option label (and in the trigger when selected). */
  icon?: ComboboxIcon;
};

export type ComboboxProps<T extends string | number> = {
  value: T;
  onChange: (value: T) => void;
  options: ComboboxOption<T>[];
  placeholder?: string;
  disabled?: boolean;
  /** Fixed leading icon for the trigger. Overrides the selected option's icon. */
  icon?: ComboboxIcon;
  id?: string;
  className?: string;
  'aria-label'?: string;
};

/**
 * Shared single-select combobox. A styled trigger opens a popup list of
 * options, each of which may carry its own icon. Closes on outside click or
 * Escape. Use this anywhere a native `<select>` would otherwise be used.
 */
export function Combobox<T extends string | number>({
  value,
  onChange,
  options,
  placeholder = 'Izberi…',
  disabled = false,
  icon,
  id,
  className,
  'aria-label': ariaLabel
}: ComboboxProps<T>) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = options.find((option) => option.value === value);
  const TriggerIcon = icon ?? selected?.icon;

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'flex w-full items-center gap-2 rounded-xl border border-brand/20 bg-transparent px-3 py-2 text-left text-sm text-brand-dark outline-none transition-colors hover:border-brand/50 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/30 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-brand/20',
          open && 'border-brand ring-2 ring-brand/30'
        )}
      >
        {TriggerIcon && <TriggerIcon size={16} className="shrink-0 text-brand" aria-hidden />}
        <span className={cn('flex-1 truncate', !selected && 'text-brand/50')}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={16}
          className={cn('shrink-0 text-brand/60 transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-brand/15 bg-white p-1 shadow-lg ring-1 ring-brand/5"
        >
          {options.map((option) => {
            const OptionIcon = option.icon;
            const isSelected = option.value === value;
            return (
              <li key={String(option.value)}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm transition-colors',
                    isSelected
                      ? 'bg-brand text-white'
                      : 'text-brand-dark hover:bg-sky'
                  )}
                >
                  {OptionIcon && <OptionIcon size={16} className="shrink-0" aria-hidden />}
                  <span className="flex-1 truncate">{option.label}</span>
                  {isSelected && <Check size={15} className="shrink-0" aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
