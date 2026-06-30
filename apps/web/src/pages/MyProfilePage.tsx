import { Pencil, UserRound } from 'lucide-react';
import { useState } from 'react';

import { MembersManager } from '../components/MembersManager';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { api } from '../lib/api';
import type { CarInput, PersonInput } from '../lib/types';
import { useAuth } from '../state/AuthContext';

export function MyProfilePage() {
  const { user, refreshUser } = useAuth();
  const [editingAccount, setEditingAccount] = useState(false);

  if (!user) {
    return null;
  }

  const persons: PersonInput[] = user.persons.map((person) => ({
    name: person.name,
    birthday: person.birthday,
    naPausalu: person.naPausalu,
    idType: person.idType,
    idNumber: person.idNumber
  }));

  const cars: CarInput[] = user.cars.map((car) => ({
    name: car.name,
    registrationPlate: car.registrationPlate
  }));

  async function persist(nextPersons: PersonInput[], nextCars: CarInput[]) {
    await api.updateProfile({ persons: nextPersons, cars: nextCars });
    await refreshUser();
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="mb-5">
        <h2 className="flex items-center gap-2 text-xl font-semibold text-white drop-shadow-sm">
          <UserRound size={20} />
          Moj profil
        </h2>
        <p className="text-sm text-white/80 drop-shadow-sm">
          Urejajte člane svoje družine in avtomobile.
        </p>
      </div>

      <div className="space-y-4 rounded-2xl bg-white/90 p-5 shadow-sm ring-1 ring-brand/10 backdrop-blur-sm">
        <div className="flex items-start justify-between gap-3 border-b border-brand/10 pb-4">
          <div className="min-w-0">
            <p className="font-semibold text-brand-dark">{user.familyName}</p>
            <p className="mt-0.5 text-sm text-brand/70">
              Uporabniško ime: <span className="font-medium text-brand-dark">{user.username}</span>
            </p>
          </div>
          <Button
            variant="transparent"
            color="brand"
            size="iconSm"
            icon={Pencil}
            onClick={() => setEditingAccount(true)}
            aria-label="Uredi račun"
            title="Uredi račun"
            className="shrink-0 text-brand"
          />
        </div>

        <MembersManager
          persons={persons}
          cars={cars}
          onPersonsChange={(next) => persist(next, cars)}
          onCarsChange={(next) => persist(persons, next)}
        />
      </div>

      {editingAccount && (
        <AccountModal
          username={user.username}
          onClose={() => setEditingAccount(false)}
          onSaved={async () => {
            await refreshUser();
            setEditingAccount(false);
          }}
        />
      )}
    </div>
  );
}

type AccountModalProps = {
  username: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
};

function AccountModal({ username, onClose, onSaved }: AccountModalProps) {
  const [form, setForm] = useState({ username, password: '', confirmPassword: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (form.password && form.password !== form.confirmPassword) {
      setError('Gesli se ne ujemata.');
      return;
    }

    setSubmitting(true);
    try {
      await api.updateAccount({
        username: form.username,
        password: form.password ? form.password : undefined
      });
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Shranjevanje ni uspelo.');
      setSubmitting(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Uredi račun">
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-brand-dark">Uporabniško ime</span>
          <Input
            type="text"
            autoComplete="off"
            value={form.username}
            onChange={(event) => update('username', event.target.value)}
            required
            autoFocus
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-brand-dark">
            Novo geslo (pustite prazno za nespremenjeno)
          </span>
          <Input
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={(event) => update('password', event.target.value)}
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-brand-dark">
            Ponovite novo geslo
          </span>
          <Input
            type="password"
            autoComplete="new-password"
            value={form.confirmPassword}
            onChange={(event) => update('confirmPassword', event.target.value)}
            required={form.password.length > 0}
          />
        </label>

        {error && <p className="text-sm font-medium text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="transparent" color="brand" onClick={onClose}>
            Prekliči
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Shranjujem…' : 'Shrani'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
