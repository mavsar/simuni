import * as RadixTooltip from '@radix-ui/react-tooltip';
import type { ReactNode } from 'react';

import { cn } from '../../lib/utils';

export type TooltipProps = {
  /** What to show inside the tooltip. When empty, the trigger renders without one. */
  content: ReactNode;
  /** The element the tooltip is attached to. Must be a single element. */
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  /** Delay before the tooltip opens, in ms. */
  delayDuration?: number;
  /** Extra classes for the tooltip content surface. */
  className?: string;
};

/**
 * Shared tooltip built on Radix UI. Wrap any focusable/hoverable element to
 * show contextual content. Pass `content` as a string or arbitrary JSX.
 */
export function Tooltip({
  content,
  children,
  side = 'top',
  align = 'center',
  delayDuration = 150,
  className
}: TooltipProps) {
  if (content === null || content === undefined || content === '') {
    return <>{children}</>;
  }

  return (
    <RadixTooltip.Provider delayDuration={delayDuration} skipDelayDuration={300}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content
            side={side}
            align={align}
            sideOffset={6}
            collisionPadding={8}
            className={cn(
              'z-[60] max-w-xs rounded-lg bg-brand-dark px-2.5 py-1.5 text-xs font-medium text-white shadow-lg',
              'data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95',
              className
            )}
          >
            {content}
            <RadixTooltip.Arrow className="fill-brand-dark" />
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  );
}
