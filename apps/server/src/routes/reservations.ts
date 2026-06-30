import { Router } from "express";
import { z } from "zod";

import { authenticate, type AuthedRequest } from "../auth/middleware.js";
import { sqlite } from "../db/client.js";

export const reservationsRouter = Router();

reservationsRouter.use(authenticate);

type ReservationRow = {
  id: number;
  user_id: number;
  start_day: string;
  end_day: string;
  family_name: string;
};

type AttendeeRow = {
  id: number;
  name: string;
  birthday: string;
  na_pausalu: number;
  id_type: string;
  id_number: string;
};

type CarRow = {
  id: number;
  name: string;
  registration_plate: string;
};

const dayPattern = /^\d{4}-\d{2}-\d{2}$/;

const selectAll = sqlite.prepare(
  `SELECT r.id, r.user_id, r.start_day, r.end_day, u.family_name
   FROM reservations r
   JOIN users u ON u.id = r.user_id
   ORDER BY r.start_day`
);
const selectById = sqlite.prepare(
  `SELECT r.id, r.user_id, r.start_day, r.end_day, u.family_name
   FROM reservations r
   JOIN users u ON u.id = r.user_id
   WHERE r.id = ?`
);
const insertReservation = sqlite.prepare(
  `INSERT INTO reservations (user_id, start_day, end_day)
   VALUES (@userId, @startDay, @endDay)`
);
const updateReservation = sqlite.prepare(
  `UPDATE reservations SET user_id = @userId, start_day = @startDay, end_day = @endDay WHERE id = @id`
);
const deleteReservation = sqlite.prepare("DELETE FROM reservations WHERE id = ?");
const userExists = sqlite.prepare("SELECT 1 FROM users WHERE id = ? LIMIT 1");

const selectAttendees = sqlite.prepare(
  `SELECT p.id, p.name, p.birthday, p.na_pausalu, p.id_type, p.id_number
   FROM reservation_persons rp
   JOIN persons p ON p.id = rp.person_id
   WHERE rp.reservation_id = ?
   ORDER BY p.id`
);
const insertAttendee = sqlite.prepare(
  "INSERT INTO reservation_persons (reservation_id, person_id) VALUES (?, ?)"
);
const deleteAttendees = sqlite.prepare(
  "DELETE FROM reservation_persons WHERE reservation_id = ?"
);
const selectFamilyPersonIds = sqlite.prepare(
  "SELECT id FROM persons WHERE family_id = ?"
);

const selectReservationCars = sqlite.prepare(
  `SELECT c.id, c.name, c.registration_plate
   FROM reservation_cars rc
   JOIN cars c ON c.id = rc.car_id
   WHERE rc.reservation_id = ?
   ORDER BY c.id`
);
const insertReservationCar = sqlite.prepare(
  "INSERT INTO reservation_cars (reservation_id, car_id) VALUES (?, ?)"
);
const deleteReservationCars = sqlite.prepare(
  "DELETE FROM reservation_cars WHERE reservation_id = ?"
);
const selectFamilyCarIds = sqlite.prepare(
  "SELECT id FROM cars WHERE family_id = ?"
);

function attendeesFor(reservationId: number) {
  return (selectAttendees.all(reservationId) as AttendeeRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    birthday: row.birthday,
    naPausalu: row.na_pausalu === 1,
    idType: row.id_type,
    idNumber: row.id_number
  }));
}

function carsFor(reservationId: number) {
  return (selectReservationCars.all(reservationId) as CarRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    registrationPlate: row.registration_plate
  }));
}

function toDto(row: ReservationRow) {
  return {
    id: row.id,
    userId: row.user_id,
    startDay: row.start_day,
    endDay: row.end_day,
    ownerName: row.family_name,
    persons: attendeesFor(row.id),
    cars: carsFor(row.id)
  };
}

function readAll() {
  return (selectAll.all() as ReservationRow[]).map(toDto);
}

/** Keep only the person ids that actually belong to the owning family. */
function validPersonIds(familyId: number, personIds: number[]): number[] {
  if (personIds.length === 0) return [];
  const owned = new Set(
    (selectFamilyPersonIds.all(familyId) as Array<{ id: number }>).map((row) => row.id)
  );
  return personIds.filter((id) => owned.has(id));
}

/** Keep only the car ids that actually belong to the owning family. */
function validCarIds(familyId: number, carIds: number[]): number[] {
  if (carIds.length === 0) return [];
  const owned = new Set(
    (selectFamilyCarIds.all(familyId) as Array<{ id: number }>).map((row) => row.id)
  );
  return carIds.filter((id) => owned.has(id));
}

function replaceAttendees(reservationId: number, personIds: number[]): void {
  deleteAttendees.run(reservationId);
  for (const personId of personIds) {
    insertAttendee.run(reservationId, personId);
  }
}

function replaceReservationCars(reservationId: number, carIds: number[]): void {
  deleteReservationCars.run(reservationId);
  for (const carId of carIds) {
    insertReservationCar.run(reservationId, carId);
  }
}

const rangeSchema = z
  .object({
    startDay: z.string().regex(dayPattern, "Pričakovan format YYYY-MM-DD"),
    endDay: z.string().regex(dayPattern, "Pričakovan format YYYY-MM-DD"),
    // Only honored for admins; lets them book on behalf of another family.
    userId: z.number().int().positive().optional(),
    // Which family members are coming on this reservation.
    personIds: z.array(z.number().int().positive()).default([]),
    // Which family cars are coming on this reservation.
    carIds: z.array(z.number().int().positive()).default([])
  })
  .refine((value) => value.startDay <= value.endDay, {
    message: "Začetni dan mora biti pred ali enak končnemu."
  });

reservationsRouter.get("/", (_req, res) => {
  res.json({ reservations: readAll() });
});

reservationsRouter.post("/", (req, res) => {
  const parsed = rangeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Neveljavni podatki." });
    return;
  }

  const user = (req as AuthedRequest).user;
  if (!user) {
    res.status(401).json({ error: "Potrebna je prijava." });
    return;
  }

  // Several families may share the bungalow, so overlapping ranges are allowed.
  // Admins may book for any family; everyone else books for themselves.
  let ownerId = user.id;
  if (user.role === "admin" && parsed.data.userId !== undefined) {
    if (!userExists.get(parsed.data.userId)) {
      res.status(400).json({ error: "Izbrana družina ne obstaja." });
      return;
    }
    ownerId = parsed.data.userId;
  }

  const personIds = validPersonIds(ownerId, parsed.data.personIds);
  const carIds = validCarIds(ownerId, parsed.data.carIds);

  const create = sqlite.transaction(() => {
    const info = insertReservation.run({
      userId: ownerId,
      startDay: parsed.data.startDay,
      endDay: parsed.data.endDay
    });
    const reservationId = Number(info.lastInsertRowid);
    replaceAttendees(reservationId, personIds);
    replaceReservationCars(reservationId, carIds);
    return reservationId;
  });

  const reservationId = create();
  const row = selectById.get(reservationId) as ReservationRow;
  res.status(201).json({ reservation: toDto(row), reservations: readAll() });
});

reservationsRouter.put("/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Neveljaven ID." });
    return;
  }

  const existing = selectById.get(id) as ReservationRow | undefined;
  if (!existing) {
    res.status(404).json({ error: "Rezervacija ne obstaja." });
    return;
  }

  const user = (req as AuthedRequest).user;
  if (!user || (existing.user_id !== user.id && user.role !== "admin")) {
    res.status(403).json({ error: "Lahko urejate samo svoje rezervacije." });
    return;
  }

  const parsed = rangeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Neveljavni podatki." });
    return;
  }

  // Admins may reassign a reservation to another family; others keep the owner.
  let ownerId = existing.user_id;
  if (user.role === "admin" && parsed.data.userId !== undefined) {
    if (!userExists.get(parsed.data.userId)) {
      res.status(400).json({ error: "Izbrana družina ne obstaja." });
      return;
    }
    ownerId = parsed.data.userId;
  }

  const personIds = validPersonIds(ownerId, parsed.data.personIds);
  const carIds = validCarIds(ownerId, parsed.data.carIds);

  const update = sqlite.transaction(() => {
    updateReservation.run({
      id,
      userId: ownerId,
      startDay: parsed.data.startDay,
      endDay: parsed.data.endDay
    });
    replaceAttendees(id, personIds);
    replaceReservationCars(id, carIds);
  });

  update();

  const row = selectById.get(id) as ReservationRow;
  res.json({ reservation: toDto(row), reservations: readAll() });
});

reservationsRouter.delete("/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Neveljaven ID." });
    return;
  }

  const existing = selectById.get(id) as ReservationRow | undefined;
  if (!existing) {
    res.status(404).json({ error: "Rezervacija ne obstaja." });
    return;
  }

  const user = (req as AuthedRequest).user;
  if (!user || (existing.user_id !== user.id && user.role !== "admin")) {
    res.status(403).json({ error: "Lahko brišete samo svoje rezervacije." });
    return;
  }

  deleteReservation.run(id);
  res.json({ reservations: readAll() });
});
