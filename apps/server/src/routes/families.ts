import { Router } from "express";
import { z } from "zod";

import { authenticate, requireAdmin, type AuthedRequest, type Role } from "../auth/middleware.js";
import { hashPassword } from "../auth/passwords.js";
import { sqlite } from "../db/client.js";
import {
  carSchema,
  carsForFamily,
  personSchema,
  personsForFamily,
  replaceCars,
  replacePersons
} from "../db/familyMembers.js";

export const familiesRouter = Router();

familiesRouter.use(authenticate, requireAdmin);

type FamilyRow = {
  id: number;
  username: string;
  family_name: string;
  role: Role;
};

const selectAll = sqlite.prepare(
  "SELECT id, username, family_name, role FROM users ORDER BY role, family_name"
);
const selectById = sqlite.prepare(
  "SELECT id, username, family_name, role FROM users WHERE id = ?"
);
const insertFamily = sqlite.prepare(
  `INSERT INTO users (username, password_hash, family_name, role)
   VALUES (@username, @passwordHash, @familyName, @role)`
);
const deleteFamilyStmt = sqlite.prepare("DELETE FROM users WHERE id = ?");
const countAdmins = sqlite.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'");

function toDto(row: FamilyRow) {
  return {
    id: row.id,
    username: row.username,
    familyName: row.family_name,
    role: row.role,
    persons: personsForFamily(row.id),
    cars: carsForFamily(row.id)
  };
}

function usernameTaken(username: string, exceptId?: number): boolean {
  const row = sqlite
    .prepare("SELECT id FROM users WHERE username = ?")
    .get(username) as { id: number } | undefined;
  return row !== undefined && row.id !== exceptId;
}

const roleSchema = z.enum(["admin", "user"]);

const createSchema = z.object({
  username: z.string().trim().min(3, "Uporabniško ime mora imeti vsaj 3 znake."),
  password: z.string().min(4, "Geslo mora imeti vsaj 4 znake."),
  familyName: z.string().trim().min(1, "Vnesite ime družine."),
  role: roleSchema,
  persons: z.array(personSchema).default([]),
  cars: z.array(carSchema).default([])
});

const updateSchema = z.object({
  username: z.string().trim().min(3, "Uporabniško ime mora imeti vsaj 3 znake."),
  password: z.string().min(4, "Geslo mora imeti vsaj 4 znake.").optional().or(z.literal("")),
  familyName: z.string().trim().min(1, "Vnesite ime družine."),
  role: roleSchema,
  persons: z.array(personSchema).default([]),
  cars: z.array(carSchema).default([])
});

familiesRouter.get("/", (_req, res) => {
  const rows = selectAll.all() as FamilyRow[];
  res.json({ families: rows.map(toDto) });
});

familiesRouter.post("/", (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Neveljavni podatki." });
    return;
  }

  if (usernameTaken(parsed.data.username)) {
    res.status(409).json({ error: "Uporabniško ime je že zasedeno." });
    return;
  }

  const data = parsed.data;
  const create = sqlite.transaction(() => {
    const info = insertFamily.run({
      username: data.username,
      passwordHash: hashPassword(data.password),
      familyName: data.familyName,
      role: data.role
    });
    const familyId = Number(info.lastInsertRowid);
    replacePersons(familyId, data.persons);
    replaceCars(familyId, data.cars);
    return familyId;
  });

  const familyId = create();
  const row = selectById.get(familyId) as FamilyRow;
  res.status(201).json(toDto(row));
});

familiesRouter.put("/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Neveljaven ID." });
    return;
  }

  const existing = selectById.get(id) as FamilyRow | undefined;
  if (!existing) {
    res.status(404).json({ error: "Družina ne obstaja." });
    return;
  }

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Neveljavni podatki." });
    return;
  }

  if (usernameTaken(parsed.data.username, id)) {
    res.status(409).json({ error: "Uporabniško ime je že zasedeno." });
    return;
  }

  // Block demoting the last admin so the app always has an administrator.
  if (existing.role === "admin" && parsed.data.role !== "admin") {
    const { count } = countAdmins.get() as { count: number };
    if (count <= 1) {
      res.status(409).json({ error: "Vsaj en administrator mora ostati." });
      return;
    }
  }

  const data = parsed.data;
  const update = sqlite.transaction(() => {
    const fields = ["username = @username", "family_name = @familyName", "role = @role"];
    const params: Record<string, unknown> = {
      id,
      username: data.username,
      familyName: data.familyName,
      role: data.role
    };

    if (data.password) {
      fields.push("password_hash = @passwordHash");
      params.passwordHash = hashPassword(data.password);
    }

    sqlite.prepare(`UPDATE users SET ${fields.join(", ")} WHERE id = @id`).run(params);
    replacePersons(id, data.persons);
    replaceCars(id, data.cars);
  });

  update();

  const row = selectById.get(id) as FamilyRow;
  res.json(toDto(row));
});

familiesRouter.delete("/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Neveljaven ID." });
    return;
  }

  const existing = selectById.get(id) as FamilyRow | undefined;
  if (!existing) {
    res.status(404).json({ error: "Družina ne obstaja." });
    return;
  }

  const currentUser = (req as AuthedRequest).user;
  if (currentUser && currentUser.id === id) {
    res.status(409).json({ error: "Ne morete izbrisati lastnega računa." });
    return;
  }

  if (existing.role === "admin") {
    const { count } = countAdmins.get() as { count: number };
    if (count <= 1) {
      res.status(409).json({ error: "Vsaj en administrator mora ostati." });
      return;
    }
  }

  deleteFamilyStmt.run(id);
  res.status(204).end();
});
