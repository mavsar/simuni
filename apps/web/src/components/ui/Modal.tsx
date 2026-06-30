import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { cn } from '../../lib/utils';
import { Button } from './Button';

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Optional footer area, typically action buttons. */
  footer?: ReactNode;
  className?: string;
};

/**
 * Shared modal dialog rendered in a portal. The backdrop blurs the page
 * behind it and closes the modal on click or when pressing Escape.
 */
export function Modal({ open, onClose, title, children, footer, className }: ModalProps) {
  useEffect(() => {
    if (!open) return;

    // Prevent body scroll while modal is open
    document.body.style.overflow = 'hidden';

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-dark/30 backdrop-blur-md"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          // max-h keeps the dialog within the viewport; flex-col lets header/footer
          // stay fixed while the body section scrolls independently.
          'relative flex w-full max-w-md flex-col rounded-2xl bg-white/95 shadow-xl ring-1 ring-brand/10 backdrop-blur-sm',
          'max-h-[calc(100dvh-2rem)]',
          className
        )}
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header — always visible, never scrolls */}
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-brand/10 px-5 py-4">
          {title ? (
            <h2 className="text-lg font-semibold text-brand-dark">{title}</h2>
          ) : (
            <span />
          )}
          <Button
            variant="transparent"
            color="brand"
            size="iconSm"
            onClick={onClose}
            aria-label="Zapri"
            icon={X}
            className="-mr-1 rounded-full text-brand"
          />
        </div>

        {/* Body — scrolls when content is taller than available space.
            min-h-0 overrides the flex default (min-height: auto) so the
            element can actually shrink and let overflow-y-auto kick in. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {/* Footer — always visible, never scrolls */}
        {footer && (
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-brand/10 px-5 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
