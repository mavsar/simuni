import type { ComponentProps, ComponentType, SVGProps } from 'react';

import { cn } from '../../lib/utils';

/** Any icon component that accepts the usual lucide-style props. */
type InputIcon = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>;

export type InputProps = ComponentProps<'input'> & {
  /** Optional leading icon shown inside the field. */
  icon?: InputIcon;
};

const baseFieldClass =
  'w-full rounded-xl border border-brand/20 bg-white px-3 py-2 text-sm text-brand-dark outline-none transition-colors hover:border-brand/50 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/30 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-brand/20';

/**
 * Shared text input styled to match the Combobox. Pass an optional `icon` to
 * render a leading glyph inside the field.
 */
export function Input({ icon: Icon, className, ...rest }: InputProps) {
  if (Icon) {
    return (
      <div className="relative">
        <Icon
          size={16}
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-brand"
        />
        <input className={cn(baseFieldClass, 'pl-9', className)} {...rest} />
      </div>
    );
  }

  return <input className={cn(baseFieldClass, className)} {...rest} />;
}

export { baseFieldClass };
