import { Router } from "express";
import { z } from "zod";

import { authenticate, requireAdmin, type AuthedRequest } from "../auth/middleware.js";
import { sqlite } from "../db/client.js";
import { recordReservationHistory } from "../db/reservationHistory.js";

export const reservationsRouter = Router();

reservationsRouter.use(authenticate);

type ReservationRow = {
  id: number;
  user_id: number;
  start_day: string;
  end_day: string;
  family_name: string;
  bungalov_paid: number;
  checkin_mode: string;
  online_checkin_email_sent: number;
  history_count: number;
  unseen_history_count: number;
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

// Unseen is per viewer: created after *this* user's last view of *this*
// reservation's history (reservation_history_views), or every row when they
// have never viewed it at all — COALESCE to '' so "never viewed" sorts
// before any real timestamp and every entry counts as unseen.
const HISTORY_COUNT_COLUMNS = `
  (SELECT COUNT(*) FROM reservation_history h WHERE h.reservation_id = r.id) AS history_count,
  (SELECT COUNT(*) FROM reservation_history h
     WHERE h.reservation_id = r.id
       AND h.created_at > COALESCE(
         (SELECT v.viewed_at FROM reservation_history_views v
            WHERE v.reservation_id = r.id AND v.user_id = @viewerId),
         ''
       )) AS unseen_history_count
`;
// Whether the automated "online reservation" notice has already gone out —
// drives the "Online checkin" / "Online checkin confirmed" label; a
// reservation only ever gets one such send (reservation_reminders is a
// dedup ledger keyed by reservation id, see onlineReservationEmails.ts).
const ONLINE_CHECKIN_EMAIL_SENT_COLUMN = `
  EXISTS(SELECT 1 FROM reservation_reminders rr WHERE rr.reservation_id = r.id) AS online_checkin_email_sent
`;
const selectAll = sqlite.prepare(
  `SELECT r.id, r.user_id, r.start_day, r.end_day, u.family_name, r.bungalov_paid, r.checkin_mode,
          ${ONLINE_CHECKIN_EMAIL_SENT_COLUMN}, ${HISTORY_COUNT_COLUMNS}
   FROM reservations r
   JOIN users u ON u.id = r.user_id
   ORDER BY r.start_day`
);
const selectById = sqlite.prepare(
  `SELECT r.id, r.user_id, r.start_day, r.end_day, u.family_name, r.bungalov_paid, r.checkin_mode,
          ${ONLINE_CHECKIN_EMAIL_SENT_COLUMN}, ${HISTORY_COUNT_COLUMNS}
   FROM reservations r
   JOIN users u ON u.id = r.user_id
   WHERE r.id = @id`
);
const markHistoryViewed = sqlite.prepare(`
  INSERT INTO reservation_history_views (reservation_id, user_id, viewed_at)
  VALUES (@reservationId, @userId, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ON CONFLICT (reservation_id, user_id) DO UPDATE SET viewed_at = excluded.viewed_at
`);
const updateReservationPayment = sqlite.prepare(
  `UPDATE reservations SET bungalov_paid = @bungalovPaid WHERE id = @id`
);
const insertReservation = sqlite.prepare(
  `INSERT INTO reservations (user_id, start_day, end_day, checkin_mode)
   VALUES (@userId, @startDay, @endDay, @checkinMode)`
);
const updateReservation = sqlite.prepare(
  `UPDATE reservations SET user_id = @userId, start_day = @startDay, end_day = @endDay, checkin_mode = @checkinMode
   WHERE id = @id`
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

const selectFamilyName = sqlite.prepare("SELECT family_name FROM users WHERE id = ?");
const selectHistory = sqlite.prepare(
  `SELECT h.id, h.action, h.changes, h.created_at, u.family_name AS actor_name, u.role AS actor_role
   FROM reservation_history h
   JOIN users u ON u.id = h.user_id
   WHERE h.reservation_id = ?
   ORDER BY h.created_at DESC, h.id DESC`
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

/** Resolves person ids to their current names, regardless of family. */
function resolvePersonNames(ids: number[]): Map<number, string> {
  if (ids.length === 0) return new Map();
  const placeholders = ids.map(() => "?").join(",");
  const rows = sqlite
    .prepare(`SELECT id, name FROM persons WHERE id IN (${placeholders})`)
    .all(...ids) as Array<{ id: number; name: string }>;
  return new Map(rows.map((row) => [row.id, row.name]));
}

/** Resolves car ids to their current names, regardless of family. */
function resolveCarNames(ids: number[]): Map<number, string> {
  if (ids.length === 0) return new Map();
  const placeholders = ids.map(() => "?").join(",");
  const rows = sqlite
    .prepare(`SELECT id, name FROM cars WHERE id IN (${placeholders})`)
    .all(...ids) as Array<{ id: number; name: string }>;
  return new Map(rows.map((row) => [row.id, row.name]));
}

function namesInOrder(ids: number[], byId: Map<number, string>): string[] {
  return ids.map((id) => byId.get(id) ?? "?");
}

function familyNameOf(userId: number): string {
  return (selectFamilyName.get(userId) as { family_name: string } | undefined)?.family_name ?? "?";
}

/** Diff of an update — only the fields that actually changed. Empty means no-op. */
function buildUpdateChanges(before: {
  startDay: string;
  endDay: string;
  ownerName: string;
  personNames: string[];
  carNames: string[];
}, after: {
  startDay: string;
  endDay: string;
  ownerName: string;
  personNames: string[];
  carNames: string[];
}): Record<string, unknown> {
  const changes: Record<string, unknown> = {};

  if (before.startDay !== after.startDay || before.endDay !== after.endDay) {
    changes.period = {
      from: { startDay: before.startDay, endDay: before.endDay },
      to: { startDay: after.startDay, endDay: after.endDay }
    };
  }
  if (before.ownerName !== after.ownerName) {
    changes.owner = { from: before.ownerName, to: after.ownerName };
  }

  const personsAdded = after.personNames.filter((name) => !before.personNames.includes(name));
  const personsRemoved = before.personNames.filter((name) => !after.personNames.includes(name));
  if (personsAdded.length > 0 || personsRemoved.length > 0) {
    changes.persons = { added: personsAdded, removed: personsRemoved };
  }

  const carsAdded = after.carNames.filter((name) => !before.carNames.includes(name));
  const carsRemoved = before.carNames.filter((name) => !after.carNames.includes(name));
  if (carsAdded.length > 0 || carsRemoved.length > 0) {
    changes.cars = { added: carsAdded, removed: carsRemoved };
  }

  return changes;
}

function toDto(row: ReservationRow) {
  return {
    id: row.id,
    userId: row.user_id,
    startDay: row.start_day,
    endDay: row.end_day,
    ownerName: row.family_name,
    persons: attendeesFor(row.id),
    cars: carsFor(row.id),
    bungalovPaid: row.bungalov_paid === 1,
    checkinMode: row.checkin_mode,
    onlineCheckinEmailSent: row.online_checkin_email_sent === 1,
    historyCount: row.history_count,
    unseenHistoryCount: row.unseen_history_count
  };
}

function readAll(viewerId: number) {
  return (selectAll.all({ viewerId }) as ReservationRow[]).map(toDto);
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
    carIds: z.array(z.number().int().positive()).default([]),
    // 'online': wants the automated pre-arrival notice, only visits
    // reception at checkout. 'manual': checks in/out at reception themselves.
    checkinMode: z.enum(["online", "manual"]).default("manual")
  })
  .refine((value) => value.startDay <= value.endDay, {
    message: "Začetni dan mora biti pred ali enak končnemu."
  });

reservationsRouter.get("/", (req, res) => {
  const user = (req as AuthedRequest).user;
  if (!user) {
    res.status(401).json({ error: "Potrebna je prijava." });
    return;
  }
  res.json({ reservations: readAll(user.id) });
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
      endDay: parsed.data.endDay,
      checkinMode: parsed.data.checkinMode
    });
    const reservationId = Number(info.lastInsertRowid);
    replaceAttendees(reservationId, personIds);
    replaceReservationCars(reservationId, carIds);
    return reservationId;
  });

  const reservationId = create();

  const personMap = resolvePersonNames(personIds);
  const carMap = resolveCarNames(carIds);
  recordReservationHistory(reservationId, user.id, "created", {
    startDay: parsed.data.startDay,
    endDay: parsed.data.endDay,
    ownerName: familyNameOf(ownerId),
    persons: namesInOrder(personIds, personMap),
    cars: namesInOrder(carIds, carMap)
  });

  const row = selectById.get({ id: reservationId, viewerId: user.id }) as ReservationRow;
  res.status(201).json({ reservation: toDto(row), reservations: readAll(user.id) });
});

reservationsRouter.put("/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Neveljaven ID." });
    return;
  }

  const user = (req as AuthedRequest).user;
  if (!user) {
    res.status(401).json({ error: "Potrebna je prijava." });
    return;
  }

  const existing = selectById.get({ id, viewerId: user.id }) as ReservationRow | undefined;
  if (!existing) {
    res.status(404).json({ error: "Rezervacija ne obstaja." });
    return;
  }

  if (existing.user_id !== user.id && user.role !== "admin") {
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

  // Captured before mutating, so the diff below compares against what was
  // actually true a moment ago.
  const before = {
    startDay: existing.start_day,
    endDay: existing.end_day,
    ownerName: existing.family_name,
    personNames: attendeesFor(id).map((person) => person.name),
    carNames: carsFor(id).map((car) => car.name)
  };

  const update = sqlite.transaction(() => {
    updateReservation.run({
      id,
      userId: ownerId,
      startDay: parsed.data.startDay,
      endDay: parsed.data.endDay,
      checkinMode: parsed.data.checkinMode
    });
    replaceAttendees(id, personIds);
    replaceReservationCars(id, carIds);
  });

  update();

  const personMap = resolvePersonNames(personIds);
  const carMap = resolveCarNames(carIds);
  const changes = buildUpdateChanges(before, {
    startDay: parsed.data.startDay,
    endDay: parsed.data.endDay,
    ownerName: familyNameOf(ownerId),
    personNames: namesInOrder(personIds, personMap),
    carNames: namesInOrder(carIds, carMap)
  });
  if (Object.keys(changes).length > 0) {
    recordReservationHistory(id, user.id, "updated", changes);
  }

  const row = selectById.get({ id, viewerId: user.id }) as ReservationRow;
  res.json({ reservation: toDto(row), reservations: readAll(user.id) });
});

const paymentSchema = z.object({
  bungalovPaid: z.boolean()
});

reservationsRouter.patch("/:id/payment", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Neveljaven ID." });
    return;
  }

  const user = (req as AuthedRequest).user;
  if (!user) {
    res.status(401).json({ error: "Potrebna je prijava." });
    return;
  }

  const existing = selectById.get({ id, viewerId: user.id }) as ReservationRow | undefined;
  if (!existing) {
    res.status(404).json({ error: "Rezervacija ne obstaja." });
    return;
  }

  const parsed = paymentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Neveljavni podatki." });
    return;
  }

  const wasPaid = existing.bungalov_paid === 1;
  updateReservationPayment.run({ id, bungalovPaid: parsed.data.bungalovPaid ? 1 : 0 });

  if (wasPaid !== parsed.data.bungalovPaid) {
    recordReservationHistory(id, user.id, "payment", {
      bungalovPaid: { from: wasPaid, to: parsed.data.bungalovPaid }
    });
  }

  const row = selectById.get({ id, viewerId: user.id }) as ReservationRow;
  res.json({ reservation: toDto(row), reservations: readAll(user.id) });
});

type HistoryRow = {
  id: number;
  action: string;
  changes: string;
  created_at: string;
  actor_name: string;
  actor_role: string;
};

reservationsRouter.get("/:id/history", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Neveljaven ID." });
    return;
  }

  const user = (req as AuthedRequest).user;
  if (!user) {
    res.status(401).json({ error: "Potrebna je prijava." });
    return;
  }

  const existing = selectById.get({ id, viewerId: user.id }) as ReservationRow | undefined;
  if (!existing) {
    res.status(404).json({ error: "Rezervacija ne obstaja." });
    return;
  }

  if (existing.user_id !== user.id && user.role !== "admin") {
    res.status(403).json({ error: "Lahko vidite samo zgodovino svojih rezervacij." });
    return;
  }

  const rows = selectHistory.all(id) as HistoryRow[];
  // Per-viewer: this clears only this user's own unseen badge, not anyone
  // else's — an admin viewing doesn't dismiss the family's notice and vice
  // versa.
  markHistoryViewed.run({ reservationId: id, userId: user.id });
  res.json({
    history: rows.map((row) => ({
      id: row.id,
      action: row.action,
      changes: JSON.parse(row.changes) as Record<string, unknown>,
      createdAt: row.created_at,
      actorName: row.actor_name,
      actorRole: row.actor_role
    }))
  });
});

reservationsRouter.delete("/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Neveljaven ID." });
    return;
  }

  const user = (req as AuthedRequest).user;
  if (!user) {
    res.status(401).json({ error: "Potrebna je prijava." });
    return;
  }

  const existing = selectById.get({ id, viewerId: user.id }) as ReservationRow | undefined;
  if (!existing) {
    res.status(404).json({ error: "Rezervacija ne obstaja." });
    return;
  }

  if (existing.user_id !== user.id && user.role !== "admin") {
    res.status(403).json({ error: "Lahko brišete samo svoje rezervacije." });
    return;
  }

  deleteReservation.run(id);
  res.json({ reservations: readAll(user.id) });
});
