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
  name: z.string().trim().min(1, "Vnesite ime osebe."),
  birthday: z.string().regex(dayPattern, "Pričakovan format YYYY-MM-DD."),
  naPausalu: z.boolean(),
  idType: idTypeSchema.default("id_card"),
  idNumber: z.string().trim().default("")
});

export const carSchema = z.object({
  name: z.string().trim().min(1, "Vnesite ime avtomobila."),
  registrationPlate: z.string().trim().min(1, "Vnesite registrsko številko.")
});

export type PersonInput = z.infer<typeof personSchema>;
export type CarInput = z.infer<typeof carSchema>;

const selectPersons = sqlite.prepare(
  "SELECT id, name, birthday, na_pausalu, id_type, id_number FROM persons WHERE family_id = ? ORDER BY id"
);
const insertPerson = sqlite.prepare(
  `INSERT INTO persons (family_id, name, birthday, na_pausalu, id_type, id_number)
   VALUES (@familyId, @name, @birthday, @naPausalu, @idType, @idNumber)`
);
const deletePersonsForFamily = sqlite.prepare("DELETE FROM persons WHERE family_id = ?");

const selectCars = sqlite.prepare(
  "SELECT id, name, registration_plate FROM cars WHERE family_id = ? ORDER BY id"
);
const insertCar = sqlite.prepare(
  `INSERT INTO cars (family_id, name, registration_plate)
   VALUES (@familyId, @name, @registrationPlate)`
);
const deleteCarsForFamily = sqlite.prepare("DELETE FROM cars WHERE family_id = ?");

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

export function replacePersons(familyId: number, persons: PersonInput[]): void {
  deletePersonsForFamily.run(familyId);
  for (const person of persons) {
    insertPerson.run({
      familyId,
      name: person.name,
      birthday: person.birthday,
      naPausalu: person.naPausalu ? 1 : 0,
      idType: person.idType,
      idNumber: person.idNumber
    });
  }
}

export function replaceCars(familyId: number, cars: CarInput[]): void {
  deleteCarsForFamily.run(familyId);
  for (const car of cars) {
    insertCar.run({
      familyId,
      name: car.name,
      registrationPlate: car.registrationPlate
    });
  }
}
