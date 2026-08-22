import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps, ComponentType, SVGProps } from 'react';

import { cn } from '../../lib/utils';

/** Any icon component that accepts the usual lucide-style props. */
type ButtonIcon = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>;

/**
 * Button styling is split across two independent axes so any fill style can be
 * combined with any color:
 *   - `variant`: how the surface is rendered — `full` (filled), `outline`
 *     (bordered) or `transparent` (text only).
 *   - `color`: the color scheme — `brand`, `sand` or `danger`.
 * The concrete classes for each combination live in `compoundVariants`.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 font-semibold whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-40 disabled:saturate-50',
  {
    variants: {
      variant: {
        full: 'shadow-sm',
        outline: 'border bg-transparent',
        transparent: 'bg-transparent',
      },
      color: {
        brand: '',
        sand: '',
        danger: '',
      },
      size: {
        sm: 'rounded-xl px-3 py-1.5 text-sm',
        md: 'rounded-xl px-4 py-2 text-sm',
        lg: 'rounded-xl px-4 py-2.5 text-sm',
        icon: 'h-9 w-9 shrink-0 rounded-xl p-0',
        iconSm: 'h-8 w-8 shrink-0 rounded-xl p-0',
      },
      fullWidth: {
        true: 'w-full',
        false: '',
      },
    },
    compoundVariants: [
      {
        variant: 'full',
        color: 'brand',
        class: 'bg-brand text-white enabled:hover:bg-brand-dark focus-visible:ring-brand/40',
      },
      {
        variant: 'full',
        color: 'sand',
        class: 'bg-sand text-brand-dark enabled:hover:bg-sand/80 focus-visible:ring-brand/30',
      },
      {
        variant: 'full',
        color: 'danger',
        class: 'bg-red-600 text-white enabled:hover:bg-red-700 focus-visible:ring-red-400/40',
      },
      {
        variant: 'outline',
        color: 'brand',
        class: 'border-brand text-brand enabled:hover:bg-brand/10 focus-visible:ring-brand/40',
      },
      {
        variant: 'outline',
        color: 'sand',
        class: 'border-sand text-brand-dark enabled:hover:bg-sand/30 focus-visible:ring-brand/30',
      },
      {
        variant: 'outline',
        color: 'danger',
        class: 'border-red-300 text-red-600 enabled:hover:bg-red-50 focus-visible:ring-red-400/40',
      },
      {
        variant: 'transparent',
        color: 'brand',
        class: 'text-brand-dark enabled:hover:bg-brand/10 focus-visible:ring-brand/30',
      },
      {
        variant: 'transparent',
        color: 'sand',
        class: 'text-brand-dark enabled:hover:bg-sand/30 focus-visible:ring-brand/20',
      },
      {
        variant: 'transparent',
        color: 'danger',
        class: 'text-red-600 enabled:hover:bg-red-50 focus-visible:ring-red-400/30',
      },
    ],
    defaultVariants: {
      variant: 'full',
      color: 'brand',
      size: 'md',
      fullWidth: false,
    },
  },
);

/** Default icon size per button size, so callers usually pass only the icon. */
const ICON_SIZE: Record<NonNullable<VariantProps<typeof buttonVariants>['size']>, number> = {
  sm: 16,
  md: 16,
  lg: 18,
  icon: 20,
  iconSm: 16,
};

export type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    /** Icon shown before the label. Size is derived from `size` unless `iconSize` is set. */
    icon?: ButtonIcon;
    /** Override the icon size (px). Defaults to a value based on the button `size`. */
    iconSize?: number;
  };

export function Button({
  variant = 'full',
  color = 'brand',
  size = 'md',
  fullWidth = false,
  icon: Icon,
  iconSize,
  type = 'button',
  className,
  children,
  ...rest
}: ButtonProps) {
  const resolvedIconSize = iconSize ?? ICON_SIZE[size ?? 'md'];

  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, color, size, fullWidth }), className)}
      {...rest}
    >
      {Icon ? <Icon size={resolvedIconSize} className="shrink-0" aria-hidden /> : null}
      {children}
    </button>
  );
}

export { buttonVariants };
