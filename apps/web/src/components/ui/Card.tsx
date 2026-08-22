import type { ElementType, HTMLAttributes } from 'react';

import { cn } from '../../lib/utils';

// ── Card ─────────────────────────────────────────────────────────────────────
// Main glass-panel used for every page-level content section.
// Standardised: rounded-2xl, white/90 glass, p-5 (sm:p-6), ring, shadow, blur.

type CardProps = HTMLAttributes<HTMLElement> & {
  /** Render as a different semantic element. Defaults to `div`. */
  as?: 'div' | 'section' | 'article';
};

export function Card({ as, className, ...props }: CardProps) {
  const As = (as ?? 'div') as ElementType;
  return (
    <As
      className={cn(
        'rounded-2xl bg-white/80 p-5 shadow-sm ring-1 ring-brand/10 backdrop-blur-sm sm:p-6',
        className
      )}
      {...props}
    />
  );
}

// ── CardItem ──────────────────────────────────────────────────────────────────
// White row used inside list-style cards (person/car list items, etc.).
// Standardised: rounded-xl, white bg, p-3, subtle ring + shadow.

type CardItemProps = HTMLAttributes<HTMLElement> & {
  as?: 'div' | 'li';
};

export function CardItem({ as, className, ...props }: CardItemProps) {
  const As = (as ?? 'div') as ElementType;
  return (
    <As
      className={cn('rounded-xl bg-white p-3 shadow-sm ring-1 ring-brand/10', className)}
      {...props}
    />
  );
}

// ── CardRow ───────────────────────────────────────────────────────────────────
// Bordered white card used for mobile list rows (reservations, seasons, etc.).
// Standardised: overflow-hidden rounded-xl border border-brand/10 white bg.

export function CardRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('overflow-hidden rounded-xl border border-brand/10 bg-white', className)}
      {...props}
    />
  );
}

// ── CardSection ───────────────────────────────────────────────────────────────
// Tinted sky-blue section used for nested groups or info/estimate panels.
// `shade="light"` → bg-sky/50 (containers, no padding).
// `shade="medium"` → bg-sky/70 with p-4 (info panels, estimate boxes).

type CardSectionProps = HTMLAttributes<HTMLDivElement> & {
  shade?: 'light' | 'medium';
};

export function CardSection({ shade = 'light', className, ...props }: CardSectionProps) {
  return (
    <div
      className={cn(
        'rounded-xl',
        shade === 'light' ? '' : 'bg-sky/70 p-4',
        className
      )}
      {...props}
    />
  );
}

// ── AlertBox ──────────────────────────────────────────────────────────────────
// Inline alert / feedback message.
// `variant="error"` → red (validation / API errors).
// `variant="info"`  → sky-blue (empty state hints, informational notes).

type AlertBoxProps = HTMLAttributes<HTMLParagraphElement> & {
  variant?: 'error' | 'info' | 'warning';
};

export function AlertBox({ variant = 'error', className, ...props }: AlertBoxProps) {
  return (
    <p
      className={cn(
        'rounded-xl px-3 py-2 text-sm font-medium',
        variant === 'error'
          ? 'bg-red-50 text-red-700 ring-1 ring-red-200'
          : variant === 'warning'
            ? 'bg-orange-50 text-orange-700 ring-1 ring-orange-200'
            : 'bg-sky/70 font-normal text-brand/70',
        className
      )}
      {...props}
    />
  );
}
