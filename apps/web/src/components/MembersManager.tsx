import { Car, Pencil, Plus, Users, X } from 'lucide-react';
import { useState } from 'react';

import { computeAge } from '../lib/dates';
import { ID_TYPE_LABEL } from '../lib/idTypes';
import type { CarInput, PersonInput } from '../lib/types';
import { CarFormModal } from './CarFormModal';
import { PersonFormModal } from './PersonFormModal';
import { Button } from './ui/Button';
import { Label } from './ui/Label';

export type MembersManagerProps = {
  persons: PersonInput[];
  cars: CarInput[];
  /**
   * Persist a new persons list. May be async; if it rejects, the open modal
   * keeps showing the error. Used for both add and edit.
   */
  onPersonsChange: (next: PersonInput[]) => void | Promise<void>;
  onCarsChange: (next: CarInput[]) => void | Promise<void>;
};

type Editor = { index: number | null } | null;

/**
 * Renders a family's persons and cars with add/edit/remove controls, opening
 * the shared PersonFormModal / CarFormModal. The same flow is reused by the
 * admin Družine page and the self-service Moj profil page.
 */
export function MembersManager({
  persons,
  cars,
  onPersonsChange,
  onCarsChange
}: MembersManagerProps) {
  const [personEditor, setPersonEditor] = useState<Editor>(null);
  const [carEditor, setCarEditor] = useState<Editor>(null);
  const [error, setError] = useState<string | null>(null);

  async function removePerson(index: number) {
    setError(null);
    try {
      await onPersonsChange(persons.filter((_, i) => i !== index));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Brisanje ni uspelo.');
    }
  }

  async function removeCar(index: number) {
    setError(null);
    try {
      await onCarsChange(cars.filter((_, i) => i !== index));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Brisanje ni uspelo.');
    }
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm font-medium text-red-600">{error}</p>}

      {/* Persons */}
      <div className="space-y-2 rounded-xl bg-sky/50">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-sm font-medium text-brand-dark">
            <Users size={15} className="text-brand" />
            Osebe
          </span>
          <Button
            type="button"
            variant="transparent"
            color="brand"
            size="sm"
            icon={Plus}
            onClick={() => setPersonEditor({ index: null })}
          >
            Dodaj osebo
          </Button>
        </div>

        {persons.length === 0 ? (
          <p className="py-1 text-xs text-brand/60">Družina še nima oseb.</p>
        ) : (
          <ul className="space-y-2">
            {persons.map((person, index) => {
              const age = computeAge(person.birthday);
              return (
                <li
                  key={index}
                  className="flex items-center gap-2 rounded-lg bg-white p-3 shadow-sm ring-1 ring-brand/10"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium text-brand-dark">{person.name}</span>
                      {age !== null && <span className="text-xs text-brand/60">({age} let)</span>}
                      {person.naPausalu && (
                        <Label color="brand" size="sm">
                          pavšal
                        </Label>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-brand/70">
                      {ID_TYPE_LABEL[person.idType]}
                      {person.idNumber ? `: ${person.idNumber}` : ''}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="transparent"
                    color="brand"
                    size="iconSm"
                    icon={Pencil}
                    aria-label="Uredi osebo"
                    title="Uredi osebo"
                    onClick={() => setPersonEditor({ index })}
                    className="text-brand"
                  />
                  <Button
                    type="button"
                    variant="transparent"
                    color="danger"
                    size="iconSm"
                    icon={X}
                    aria-label="Odstrani osebo"
                    title="Odstrani osebo"
                    onClick={() => void removePerson(index)}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Cars */}
      <div className="space-y-2 rounded-xl bg-sky/50">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-sm font-medium text-brand-dark">
            <Car size={15} className="text-brand" />
            Avtomobili
          </span>
          <Button
            type="button"
            variant="transparent"
            color="brand"
            size="sm"
            icon={Plus}
            onClick={() => setCarEditor({ index: null })}
          >
            Dodaj avto
          </Button>
        </div>

        {cars.length === 0 ? (
          <p className="py-1 text-xs text-brand/60">Družina še nima dodanih avtomobilov.</p>
        ) : (
          <ul className="space-y-2">
            {cars.map((car, index) => (
              <li
                key={index}
                className="flex items-center gap-2 rounded-lg bg-white p-3 shadow-sm ring-1 ring-brand/10"
              >
                <div className="flex-1">
                  <span className="font-medium text-brand-dark">{car.name}</span>
                  <span className="text-brand/70"> ({car.registrationPlate})</span>

                </div>
                <Button
                  type="button"
                  variant="transparent"
                  color="brand"
                  size="iconSm"
                  icon={Pencil}
                  aria-label="Uredi avto"
                  title="Uredi avto"
                  onClick={() => setCarEditor({ index })}
                  className="text-brand"
                />
                <Button
                  type="button"
                  variant="transparent"
                  color="danger"
                  size="iconSm"
                  icon={X}
                  aria-label="Odstrani avto"
                  title="Odstrani avto"
                  onClick={() => void removeCar(index)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {personEditor && (
        <PersonFormModal
          title={personEditor.index === null ? 'Dodaj osebo' : 'Uredi osebo'}
          submitLabel={personEditor.index === null ? 'Dodaj' : 'Shrani'}
          initial={personEditor.index === null ? undefined : persons[personEditor.index]}
          onClose={() => setPersonEditor(null)}
          onSubmit={async (person) => {
            const next =
              personEditor.index === null
                ? [...persons, person]
                : persons.map((existing, i) => (i === personEditor.index ? person : existing));
            await onPersonsChange(next);
            setPersonEditor(null);
          }}
        />
      )}

      {carEditor && (
        <CarFormModal
          title={carEditor.index === null ? 'Dodaj avto' : 'Uredi avto'}
          submitLabel={carEditor.index === null ? 'Dodaj' : 'Shrani'}
          initial={carEditor.index === null ? undefined : cars[carEditor.index]}
          onClose={() => setCarEditor(null)}
          onSubmit={async (car) => {
            const next =
              carEditor.index === null
                ? [...cars, car]
                : cars.map((existing, i) => (i === carEditor.index ? car : existing));
            await onCarsChange(next);
            setCarEditor(null);
          }}
        />
      )}
    </div>
  );
}
