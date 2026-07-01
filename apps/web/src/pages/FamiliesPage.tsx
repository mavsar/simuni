import { Home, Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

import { MembersManager } from '../components/MembersManager';
import { AlertBox, Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Combobox, type ComboboxOption } from '../components/ui/Combobox';
import { Input } from '../components/ui/Input';
import { Label } from '../components/ui/Label';
import { api } from '../lib/api';
import type {
  Car,
  CarInput,
  CreateFamilyInput,
  Family,
  Person,
  PersonInput,
  Role,
  UpdateFamilyInput
} from '../lib/types';

export type FamiliesPageProps = {
  currentUserId: number;
};

type FormState = {
  familyName: string;
  username: string;
  role: Role;
  password: string;
};

const EMPTY_FORM: FormState = {
  familyName: '',
  username: '',
  role: 'user',
  password: ''
};

const ROLE_LABEL: Record<Role, string> = {
  admin: 'Administrator',
  user: 'Navaden uporabnik'
};

const ROLE_OPTIONS: ComboboxOption<Role>[] = [
  { value: 'user', label: 'Navaden uporabnik', icon: Home },
  { value: 'admin', label: 'Administrator', icon: ShieldCheck }
];

function toPersonInput(person: Person): PersonInput {
  return {
    name: person.name,
    birthday: person.birthday,
    naPausalu: person.naPausalu,
    idType: person.idType,
    idNumber: person.idNumber
  };
}

function toCarInput(car: Car): CarInput {
  return {
    name: car.name,
    registrationPlate: car.registrationPlate
  };
}

export function FamiliesPage({ currentUserId }: FamiliesPageProps) {
  const [families, setFamilies] = useState<Family[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Family | null>(null);
  const [creating, setCreating] = useState(false);

  async function refresh() {
    setError(null);
    try {
      const { families: list } = await api.listFamilies();
      setFamilies(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Napaka pri nalaganju.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleDelete(family: Family) {
    const confirmed = window.confirm(`Izbrišem družino ${family.familyName} (${family.username})?`);
    if (!confirmed) return;

    setError(null);
    try {
      await api.deleteFamily(family.id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Brisanje ni uspelo.');
    }
  }

  // Persist a family's members/cars without touching its account fields. The
  // families endpoint replaces both lists, so the unchanged one is sent as-is.
  async function saveMembers(family: Family, persons: PersonInput[], cars: CarInput[]) {
    await api.updateFamily(family.id, {
      username: family.username,
      familyName: family.familyName,
      role: family.role,
      persons,
      cars
    });
    await refresh();
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="mb-1 text-xl font-semibold text-white drop-shadow-sm">Družine</h2>
          <p className="text-sm text-white/80 drop-shadow-sm">
            Upravljanje družin in njihovih članov.
          </p>
        </div>
        <Button onClick={() => setCreating(true)} icon={Plus}>
          Dodaj družino
        </Button>
      </div>

      {error && <AlertBox className="mb-4">{error}</AlertBox>}

      {loading ? (
        <Card className="text-center text-sm text-brand/70">Nalagam…</Card>
      ) : families.length === 0 ? (
        <Card className="text-center text-sm text-brand/70">Ni družin.</Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {families.map((family) => (
            <Card
              key={family.id}
              className="flex flex-col"
            >
              <div className="mb-4 flex items-start justify-between gap-3 border-b border-brand/10 pb-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-base font-semibold text-brand-dark">
                      {family.familyName}
                    </h3>
                    {family.id === currentUserId && <Label color="brand">vi</Label>}
                    <Label
                      color={family.role === 'admin' ? 'brand' : 'sky'}
                      variant={family.role === 'admin' ? 'solid' : 'soft'}
                    >
                      {ROLE_LABEL[family.role]}
                    </Label>
                  </div>
                  <p className="mt-0.5 truncate text-sm text-brand/70">
                    Uporabniško ime: {family.username}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="transparent"
                    color="brand"
                    size="iconSm"
                    onClick={() => setEditing(family)}
                    aria-label="Uredi družino"
                    title="Uredi družino"
                    icon={Pencil}
                    className="text-brand"
                  />
                  <Button
                    variant="transparent"
                    color="danger"
                    size="iconSm"
                    onClick={() => handleDelete(family)}
                    disabled={family.id === currentUserId}
                    aria-label="Izbriši družino"
                    title={
                      family.id === currentUserId
                        ? 'Lastnega računa ne morete izbrisati'
                        : 'Izbriši družino'
                    }
                    icon={Trash2}
                  />
                </div>
              </div>

              <MembersManager
                persons={family.persons.map(toPersonInput)}
                cars={family.cars.map(toCarInput)}
                onPersonsChange={(next) => saveMembers(family, next, family.cars.map(toCarInput))}
                onCarsChange={(next) => saveMembers(family, family.persons.map(toPersonInput), next)}
              />
            </Card>
          ))}
        </div>
      )}

      {creating && (
        <FamilyFormModal
          title="Nova družina"
          submitLabel="Ustvari"
          initial={EMPTY_FORM}
          requirePassword
          onClose={() => setCreating(false)}
          onSubmit={async (form) => {
            const input: CreateFamilyInput = {
              username: form.username,
              password: form.password,
              familyName: form.familyName,
              role: form.role,
              persons: [],
              cars: []
            };
            await api.createFamily(input);
            setCreating(false);
            await refresh();
          }}
        />
      )}

      {editing && (
        <FamilyFormModal
          title="Uredi družino"
          submitLabel="Shrani"
          initial={{
            familyName: editing.familyName,
            username: editing.username,
            role: editing.role,
            password: ''
          }}
          requirePassword={false}
          onClose={() => setEditing(null)}
          onSubmit={async (form) => {
            const input: UpdateFamilyInput = {
              username: form.username,
              familyName: form.familyName,
              role: form.role,
              password: form.password ? form.password : undefined,
              // Account-only edit: keep the family's existing members and cars.
              persons: editing.persons.map(toPersonInput),
              cars: editing.cars.map(toCarInput)
            };
            await api.updateFamily(editing.id, input);
            setEditing(null);
            await refresh();
          }}
        />
      )}
    </div>
  );
}

type FamilyFormModalProps = {
  title: string;
  submitLabel: string;
  initial: FormState;
  requirePassword: boolean;
  onClose: () => void;
  onSubmit: (form: FormState) => Promise<void>;
};

function FamilyFormModal({
  title,
  submitLabel,
  initial,
  requirePassword,
  onClose,
  onSubmit
}: FamilyFormModalProps) {
  const [form, setForm] = useState<FormState>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-brand-dark/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-brand-dark">
          <Plus size={18} className="text-brand" />
          {title}
        </h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Ime družine">
            <Input
              type="text"
              value={form.familyName}
              onChange={(event) => update('familyName', event.target.value)}
              required
            />
          </Field>

          <Field label="Uporabniško ime">
            <Input
              type="text"
              autoComplete="off"
              value={form.username}
              onChange={(event) => update('username', event.target.value)}
              required
            />
          </Field>

          <Field label={requirePassword ? 'Geslo' : 'Novo geslo (pustite prazno za nespremenjeno)'}>
            <Input
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={(event) => update('password', event.target.value)}
              required={requirePassword}
            />
          </Field>

          <div className="block">
            <span className="mb-1.5 block text-sm font-medium text-brand-dark">Vloga</span>
            <Combobox<Role>
              value={form.role}
              onChange={(role) => update('role', role)}
              aria-label="Vloga"
              options={ROLE_OPTIONS}
            />
          </div>

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
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-brand-dark">{label}</span>
      {children}
    </label>
  );
}
