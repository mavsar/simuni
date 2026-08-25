import { z } from "zod";

import { sqlite } from "./client.js";

/**
 * Shared persistence and validation for a family's members (persons) and cars.
 * Both the admin "families" route and the self-service "profile" route build on
 * these so the data shape and rules stay identical everywhere.
 */

export type PersonRow = {
  id: number;
  name: string;
  birthday: string;
  na_pausalu: number;
  id_type: string;
  id_number: string;
};

export type CarRow = {
  id: number;
  name: string;
  registration_plate: string;
};

const dayPattern = /^\d{4}-\d{2}-\d{2}$/;

export const idTypeSchema = z.enum(["id_card", "drivers_license", "passport"]);

export const personSchema = z.object({
  // Present when editing an existing person — lets replacePersons() update
  // that row in place instead of recreating it under a new id, which would
  // orphan every reservation_persons link to it. Absent (or unrecognized)
  // means "this is a new person."
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1, "Vnesite ime osebe."),
  birthday: z.string().regex(dayPattern, "Pričakovan format YYYY-MM-DD."),
  naPausalu: z.boolean(),
  idType: idTypeSchema.default("id_card"),
  idNumber: z.string().trim().default("")
});

export const carSchema = z.object({
  /** Same role as `personSchema.id` — see its comment. */
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1, "Vnesite ime avtomobila."),
  registrationPlate: z.string().trim().min(1, "Vnesite registrsko številko.")
});

export type PersonInput = z.infer<typeof personSchema>;
export type CarInput = z.infer<typeof carSchema>;

const selectPersons = sqlite.prepare(
  "SELECT id, name, birthday, na_pausalu, id_type, id_number FROM persons WHERE family_id = ? ORDER BY id"
);
const selectPersonIds = sqlite.prepare("SELECT id FROM persons WHERE family_id = ?");
const insertPerson = sqlite.prepare(
  `INSERT INTO persons (family_id, name, birthday, na_pausalu, id_type, id_number)
   VALUES (@familyId, @name, @birthday, @naPausalu, @idType, @idNumber)`
);
const updatePerson = sqlite.prepare(
  `UPDATE persons SET name = @name, birthday = @birthday, na_pausalu = @naPausalu,
     id_type = @idType, id_number = @idNumber
   WHERE id = @id AND family_id = @familyId`
);
const deletePersonById = sqlite.prepare("DELETE FROM persons WHERE id = ? AND family_id = ?");

const selectCars = sqlite.prepare(
  "SELECT id, name, registration_plate FROM cars WHERE family_id = ? ORDER BY id"
);
const selectCarIds = sqlite.prepare("SELECT id FROM cars WHERE family_id = ?");
const insertCar = sqlite.prepare(
  `INSERT INTO cars (family_id, name, registration_plate)
   VALUES (@familyId, @name, @registrationPlate)`
);
const updateCar = sqlite.prepare(
  `UPDATE cars SET name = @name, registration_plate = @registrationPlate
   WHERE id = @id AND family_id = @familyId`
);
const deleteCarById = sqlite.prepare("DELETE FROM cars WHERE id = ? AND family_id = ?");

export function personToDto(row: PersonRow) {
  return {
    id: row.id,
    name: row.name,
    birthday: row.birthday,
    naPausalu: row.na_pausalu === 1,
    idType: row.id_type,
    idNumber: row.id_number
  };
}

export function carToDto(row: CarRow) {
  return {
    id: row.id,
    name: row.name,
    registrationPlate: row.registration_plate
  };
}

export function personsForFamily(familyId: number) {
  return (selectPersons.all(familyId) as PersonRow[]).map(personToDto);
}

export function carsForFamily(familyId: number) {
  return (selectCars.all(familyId) as CarRow[]).map(carToDto);
}

/**
 * Reconciles a family's persons with the given list: existing rows named by
 * `id` are updated in place (keeping their id, so any reservation_persons
 * link to them survives), rows missing from the list are deleted (cascading
 * their reservation links, as intended for an actual removal), and entries
 * without an `id` — or with one that doesn't belong to this family — are
 * inserted as new persons. Never deletes-and-recreates an unchanged person,
 * which would otherwise silently orphan them from every reservation they're
 * on just because a sibling's details were edited in the same save.
 */
export function replacePersons(familyId: number, persons: PersonInput[]): void {
  const existingIds = new Set(
    (selectPersonIds.all(familyId) as Array<{ id: number }>).map((row) => row.id)
  );
  const keepIds = new Set(
    persons.flatMap((person) => (person.id !== undefined && existingIds.has(person.id) ? [person.id] : []))
  );
  for (const id of existingIds) {
    if (!keepIds.has(id)) deletePersonById.run(id, familyId);
  }
  for (const person of persons) {
    const params = {
      familyId,
      name: person.name,
      birthday: person.birthday,
      naPausalu: person.naPausalu ? 1 : 0,
      idType: person.idType,
      idNumber: person.idNumber
    };
    if (person.id !== undefined && existingIds.has(person.id)) {
      updatePerson.run({ ...params, id: person.id });
    } else {
      insertPerson.run(params);
    }
  }
}

/** Same reconciliation as replacePersons(), for a family's cars. */
export function replaceCars(familyId: number, cars: CarInput[]): void {
  const existingIds = new Set(
    (selectCarIds.all(familyId) as Array<{ id: number }>).map((row) => row.id)
  );
  const keepIds = new Set(
    cars.flatMap((car) => (car.id !== undefined && existingIds.has(car.id) ? [car.id] : []))
  );
  for (const id of existingIds) {
    if (!keepIds.has(id)) deleteCarById.run(id, familyId);
  }
  for (const car of cars) {
    const params = { familyId, name: car.name, registrationPlate: car.registrationPlate };
    if (car.id !== undefined && existingIds.has(car.id)) {
      updateCar.run({ ...params, id: car.id });
    } else {
      insertCar.run(params);
    }
  }
}
