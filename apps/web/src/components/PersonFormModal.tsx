import { useState } from 'react';

import { computeAge } from '../lib/dates';
import { ID_TYPE_OPTIONS } from '../lib/idTypes';
import type { IdType, PersonInput } from '../lib/types';
import { Button } from './ui/Button';
import { Checkbox } from './ui/Checkbox';
import { Combobox } from './ui/Combobox';
import { Input } from './ui/Input';
import { Modal } from './ui/Modal';

const EMPTY_PERSON: PersonInput = {
  name: '',
  birthday: '',
  naPausalu: false,
  idType: 'id_card',
  idNumber: ''
};

export type PersonFormModalProps = {
  title: string;
  submitLabel: string;
  /** Existing values when editing; omit to add a new person. */
  initial?: PersonInput;
  onClose: () => void;
  onSubmit: (person: PersonInput) => void | Promise<void>;
};

/**
 * Shared add/edit dialog for a single family member. Used identically by the
 * admin Družine page and the self-service Moj profil page.
 */
export function PersonFormModal({
  title,
  submitLabel,
  initial,
  onClose,
  onSubmit
}: PersonFormModalProps) {
  const [form, setForm] = useState<PersonInput>(initial ?? EMPTY_PERSON);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const age = computeAge(form.birthday);

  function update<K extends keyof PersonInput>(key: K, value: PersonInput[K]) {
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
          <span className="mb-1.5 block text-sm font-medium text-brand-dark">Ime in priimek</span>
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
            {`Rojstni dan${age !== null ? ` · ${age} let` : ''}`}
          </span>
          <Input
            type="date"
            value={form.birthday}
            onChange={(event) => update('birthday', event.target.value)}
            required
          />
        </label>

        <div className="block">
          <span className="mb-1.5 block text-sm font-medium text-brand-dark">
            Vrsta dokumenta
          </span>
          <Combobox<IdType>
            value={form.idType}
            onChange={(idType) => update('idType', idType)}
            aria-label="Vrsta dokumenta"
            options={ID_TYPE_OPTIONS}
          />
        </div>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-brand-dark">
            Številka dokumenta
          </span>
          <Input
            type="text"
            value={form.idNumber}
            onChange={(event) => update('idNumber', event.target.value)}
          />
        </label>

        <Checkbox
          checked={form.naPausalu}
          onChange={(event) => update('naPausalu', event.target.checked)}
          label="Na pavšalu"
        />

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
