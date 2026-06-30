import { useState } from 'react';

import type { CarInput } from '../lib/types';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Modal } from './ui/Modal';

const EMPTY_CAR: CarInput = {
  name: '',
  registrationPlate: ''
};

export type CarFormModalProps = {
  title: string;
  submitLabel: string;
  /** Existing values when editing; omit to add a new car. */
  initial?: CarInput;
  onClose: () => void;
  onSubmit: (car: CarInput) => void | Promise<void>;
};

/**
 * Shared add/edit dialog for a single car. Used identically by the admin
 * Družine page and the self-service Moj profil page.
 */
export function CarFormModal({ title, submitLabel, initial, onClose, onSubmit }: CarFormModalProps) {
  const [form, setForm] = useState<CarInput>(initial ?? EMPTY_CAR);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof CarInput>(key: K, value: CarInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Shranjevanje ni uspelo.');
      setSubmitting(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={title}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-brand-dark">Ime</span>
          <Input
            type="text"
            value={form.name}
            onChange={(event) => update('name', event.target.value)}
            required
            autoFocus
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-brand-dark">
            Registrska številka
          </span>
          <Input
            type="text"
            value={form.registrationPlate}
            onChange={(event) => update('registrationPlate', event.target.value)}
            required
          />
        </label>

        {error && <p className="text-sm font-medium text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="transparent" color="brand" onClick={onClose}>
            Prekliči
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Shranjujem…' : submitLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
