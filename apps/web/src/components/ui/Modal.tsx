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

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-brand-dark/30 p-4 backdrop-blur-md"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'relative w-full max-w-md rounded-2xl bg-white/95 shadow-xl ring-1 ring-brand/10 backdrop-blur-sm',
          className
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 border-b border-brand/10 px-5 py-4">
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

        <div className="px-5 py-4">{children}</div>

        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-brand/10 px-5 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
