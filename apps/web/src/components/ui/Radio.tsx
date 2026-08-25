import type { ComponentProps, ComponentType, ReactNode, SVGProps } from 'react';

import { cn } from '../../lib/utils';

/** Any icon component that accepts the usual lucide-style props. */
type RadioIcon = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>;

export type RadioProps = Omit<ComponentProps<'input'>, 'type'> & {
  /** Main label text, shown next to the circle. */
  label?: ReactNode;
  /** Optional secondary line shown under the label. */
  description?: ReactNode;
  /** Optional leading icon between the circle and the label. */
  icon?: RadioIcon;
  /** Optional detail shown in brackets right after the label. */
  trailing?: ReactNode;
  /** className applied to the wrapping `<label>` instead of the `<input>`. */
  labelClassName?: string;
};

/**
 * Shared radio button — same flat layout as Checkbox, no surrounding
 * box/border/padding. Group mutually-exclusive options with a shared `name`
 * (passed straight through via the usual input props).
 */
export function Radio({
  label,
  description,
  icon: Icon,
  trailing,
  className,
  labelClassName,
  disabled,
  ...rest
}: RadioProps) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-center gap-2 text-sm text-brand-dark',
        disabled && 'cursor-not-allowed opacity-60',
        labelClassName,
      )}
    >
      <input
        type="radio"
        disabled={disabled}
        className={cn(
          'h-4 w-4 rounded-full border-brand/30 text-brand focus:ring-brand',
          className,
        )}
        {...rest}
      />
      {Icon && <Icon size={15} className="text-brand/70" aria-hidden />}
      {description ? (
        <span className="flex-1">
          <span className="block font-medium">{label}</span>
          <span className="block text-xs text-brand/60">{description}</span>
        </span>
      ) : (
        <span className="truncate">
          {label}
          {trailing && <span className="text-brand/50"> ({trailing})</span>}
        </span>
      )}
    </label>
  );
}
