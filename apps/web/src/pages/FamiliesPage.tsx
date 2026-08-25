import { Home, Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useMatch, useNavigate } from 'react-router-dom';

import { MembersManager } from '../components/MembersManager';
import { AlertBox, Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Checkbox } from '../components/ui/Checkbox';
import { Combobox, type ComboboxOption } from '../components/ui/Combobox';
import { ConfirmModal } from '../components/ui/ConfirmModal';
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
  email: string;
  paymentExcluded: boolean;
};

const EMPTY_FORM: FormState = {
  familyName: '',
  username: '',
  role: 'user',
  password: '',
  email: '',
  paymentExcluded: false
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
    id: person.id,
    name: person.name,
    birthday: person.birthday,
    naPausalu: person.naPausalu,
    idType: person.idType,
    idNumber: person.idNumber
  };
}

function toCarInput(car: Car): CarInput {
  return {
    id: car.id,
    name: car.name,
    registrationPlate: car.registrationPlate
  };
}

export function FamiliesPage({ currentUserId }: FamiliesPageProps) {
  const navigate = useNavigate();
  // Which modal (if any) is open lives in the URL, so it's bookmarkable and
  // the browser back button closes it.
  const creating = useMatch('/druzine/nova-druzina') !== null;
  const editMatch = useMatch('/druzine/:username/uredi');
  const editUsername = editMatch?.params.username ?? null;

  const [families, setFamilies] = useState<Family[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const editing =
    editUsername !== null ? (families.find((f) => f.username === editUsername) ?? null) : null;

  // A URL naming a family that doesn't exist (deleted, renamed) bounces back
  // once the family list has actually loaded.
  useEffect(() => {
    if (editUsername === null || loading) return;
    if (!editing) navigate('/druzine', { replace: true });
  }, [editUsername, editing, loading, navigate]);

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

  const [deleteTarget, setDeleteTarget] = useState<Family | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setError(null);
    try {
      await api.deleteFamily(deleteTarget.id);
      setDeleteTarget(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Brisanje ni uspelo.');
    } finally {
      setDeleteBusy(false);
    }
  }

  // Persist a family's members/cars without touching its account fields. The
  // families endpoint replaces both lists, so the unchanged one is sent as-is.
  async function saveMembers(family: Family, persons: PersonInput[], cars: CarInput[]) {
    await api.updateFamily(family.id, {
      username: family.username,
      familyName: family.familyName,
      role: family.role,
      email: family.email,
      paymentExcluded: family.paymentExcluded,
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
        <Button onClick={() => navigate('/druzine/nova-druzina')} icon={Plus}>
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
                    {family.paymentExcluded && (
                      <Label color="orange" size="sm">
                        izvzeta iz plačila
                      </Label>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-sm text-brand/70">
                    Uporabniško ime: {family.username}
                  </p>
                  {family.email && (
                    <p className="mt-0.5 truncate text-sm text-brand/70">
                      E-pošta: {family.email}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="transparent"
                    color="brand"
                    size="iconSm"
                    onClick={() => navigate(`/druzine/${family.username}/uredi`)}
                    aria-label="Uredi družino"
                    title="Uredi družino"
                    icon={Pencil}
                    className="text-brand"
                  />
                  <Button
                    variant="transparent"
                    color="danger"
                    size="iconSm"
                    onClick={() => setDeleteTarget(family)}
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
          onClose={() => navigate('/druzine')}
          onSubmit={async (form) => {
            const input: CreateFamilyInput = {
              username: form.username,
              password: form.password,
              familyName: form.familyName,
              role: form.role,
              email: form.email,
              paymentExcluded: form.paymentExcluded,
              persons: [],
              cars: []
            };
            await api.createFamily(input);
            navigate('/druzine');
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
            password: '',
            email: editing.email,
            paymentExcluded: editing.paymentExcluded
          }}
          requirePassword={false}
          onClose={() => navigate('/druzine')}
          onSubmit={async (form) => {
            const input: UpdateFamilyInput = {
              username: form.username,
              familyName: form.familyName,
              role: form.role,
              password: form.password ? form.password : undefined,
              email: form.email,
              paymentExcluded: form.paymentExcluded,
              // Account-only edit: keep the family's existing members and cars.
              persons: editing.persons.map(toPersonInput),
              cars: editing.cars.map(toCarInput)
            };
            await api.updateFamily(editing.id, input);
            navigate('/druzine');
            await refresh();
          }}
        />
      )}

      <ConfirmModal
        open={deleteTarget !== null}
        title="Izbriši družino?"
        destructive
        busy={deleteBusy}
        confirmLabel="Izbriši"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      >
        {deleteTarget &&
          `Družina ${deleteTarget.familyName} (${deleteTarget.username}) bo trajno izbrisana, skupaj z vsemi njenimi rezervacijami, osebami in avtomobili.`}
      </ConfirmModal>
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

          <Field label="E-pošta">
            <Input
              type="email"
              autoComplete="off"
              value={form.email}
              onChange={(event) => update('email', event.target.value)}
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

          <div className="block">
            <span className="mb-1.5 block text-sm font-medium text-brand-dark">Plačilo</span>
            <Checkbox
              checked={form.paymentExcluded}
              onChange={(event) => update('paymentExcluded', event.target.checked)}
              label="Izvzeta iz plačila"
              description="Ne vidi cene bungalova in ne prejme e-pošte ob potrditvi cen."
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
