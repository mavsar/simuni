import type { ReactNode } from 'react';

import { Button } from './Button';
import { Modal } from './Modal';

export type ConfirmModalProps = {
  open: boolean;
  title: string;
  /** Body copy explaining exactly what the confirmation will do. */
  children: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Danger styling for irreversible or unlocking actions. */
  destructive?: boolean;
  /** Disables both buttons while the caller's async action runs. */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Shared "Are you sure?" dialog. The caller owns the async action and closing
 * — this component only renders the question and reports the answer.
 */
export function ConfirmModal({
  open,
  title,
  children,
  confirmLabel = 'Potrdi',
  cancelLabel = 'Prekliči',
  destructive = false,
  busy = false,
  onConfirm,
  onCancel
}: ConfirmModalProps) {
  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) onCancel();
      }}
      title={title}
      footer={
        <>
          <Button variant="transparent" color="brand" disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button color={destructive ? 'danger' : 'brand'} disabled={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm text-brand-dark/90">{children}</div>
    </Modal>
  );
}
