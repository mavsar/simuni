import { cva, cx, type VariantProps } from 'class-variance-authority';
import type { ComponentProps, ReactNode } from 'react';

/**
 * Small inline label / badge (e.g. role, status, registration plate). Two axes:
 *   - `color`: the color scheme — brand, sand, sky, green, red, orange, neutral.
 *   - `variant`: `soft` (tinted background) or `solid` (filled).
 * Concrete classes for each combination live in `compoundVariants`.
 */
const labelVariants = cva(
  'inline-flex items-center gap-1 rounded-xl font-medium whitespace-nowrap',
  {
    variants: {
      color: {
        brand: '',
        sand: '',
        sky: '',
        green: '',
        red: '',
        orange: '',
        neutral: ''
      },
      variant: {
        soft: '',
        solid: ''
      },
      size: {
        sm: 'px-1.5 py-0.5 text-[10px]',
        md: 'px-2.5 py-0.5 text-xs',
        lg: 'px-3 py-1 text-sm'
      }
    },
    compoundVariants: [
      // soft
      { variant: 'soft', color: 'brand', class: 'bg-brand/10 text-brand' },
      { variant: 'soft', color: 'sand', class: 'bg-sand text-brand-dark' },
      { variant: 'soft', color: 'sky', class: 'bg-sky text-brand-dark' },
      { variant: 'soft', color: 'green', class: 'bg-green-100 text-green-700' },
      { variant: 'soft', color: 'red', class: 'bg-red-100 text-red-700' },
      { variant: 'soft', color: 'orange', class: 'bg-orange-100 text-orange-700' },
      { variant: 'soft', color: 'neutral', class: 'bg-brand/5 text-brand/70' },
      // solid
      { variant: 'solid', color: 'brand', class: 'bg-brand text-white' },
      { variant: 'solid', color: 'sand', class: 'bg-sand text-brand-dark' },
      { variant: 'solid', color: 'sky', class: 'bg-sky text-brand-dark' },
      { variant: 'solid', color: 'green', class: 'bg-green-600 text-white' },
      { variant: 'solid', color: 'red', class: 'bg-red-600 text-white' },
      { variant: 'solid', color: 'orange', class: 'bg-orange-500 text-white' },
      { variant: 'solid', color: 'neutral', class: 'bg-brand-dark text-white' }
    ],
    defaultVariants: {
      color: 'brand',
      variant: 'soft',
      size: 'md'
    }
  }
);

export type LabelProps = ComponentProps<'span'> & VariantProps<typeof labelVariants>;

/** Uppercase the first letter of plain-text content; leave other nodes as-is. */
function capitalizeFirst(children: ReactNode): ReactNode {
  if (typeof children === 'string' && children.length > 0) {
    return children.charAt(0).toUpperCase() + children.slice(1);
  }
  return children;
}

export function Label({ color, variant, size, className, children, ...rest }: LabelProps) {
  return (
    <span className={cx(labelVariants({ color, variant, size }), className)} {...rest}>
      {capitalizeFirst(children)}
    </span>
  );
}

export { labelVariants };
