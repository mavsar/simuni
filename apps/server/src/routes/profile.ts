import { Router } from "express";
import { z } from "zod";

import { authenticate, type AuthedRequest, type Role } from "../auth/middleware.js";
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

export const profileRouter = Router();

// Any authenticated user manages their own family here (no admin requirement).
profileRouter.use(authenticate);

type FamilyRow = {
  id: number;
  username: string;
  family_name: string;
  role: Role;
};

const selectById = sqlite.prepare(
  "SELECT id, username, family_name, role FROM users WHERE id = ?"
);

function toDto(id: number) {
  const row = selectById.get(id) as FamilyRow;
  return {
    id: row.id,
    username: row.username,
    familyName: row.family_name,
    role: row.role,
    persons: personsForFamily(row.id),
    cars: carsForFamily(row.id)
  };
}

const updateSchema = z.object({
  persons: z.array(personSchema).default([]),
  cars: z.array(carSchema).default([])
});

const accountSchema = z.object({
  username: z.string().trim().min(3, "Uporabniško ime mora imeti vsaj 3 znake."),
  // Empty string keeps the current password.
  password: z.string().min(4, "Geslo mora imeti vsaj 4 znake.").optional().or(z.literal(""))
});

function usernameTaken(username: string, exceptId: number): boolean {
  const row = sqlite
    .prepare("SELECT id FROM users WHERE username = ?")
    .get(username) as { id: number } | undefined;
  return row !== undefined && row.id !== exceptId;
}

profileRouter.get("/", (req, res) => {
  const user = (req as AuthedRequest).user;
  if (!user) {
    res.status(401).json({ error: "Potrebna je prijava." });
    return;
  }
  res.json(toDto(user.id));
});

profileRouter.put("/", (req, res) => {
  const user = (req as AuthedRequest).user;
  if (!user) {
    res.status(401).json({ error: "Potrebna je prijava." });
    return;
  }

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Neveljavni podatki." });
    return;
  }

  const data = parsed.data;
  const apply = sqlite.transaction(() => {
    replacePersons(user.id, data.persons);
    replaceCars(user.id, data.cars);
  });
  apply();

  res.json(toDto(user.id));
});

profileRouter.put("/account", (req, res) => {
  const user = (req as AuthedRequest).user;
  if (!user) {
    res.status(401).json({ error: "Potrebna je prijava." });
    return;
  }

  const parsed = accountSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Neveljavni podatki." });
    return;
  }

  if (usernameTaken(parsed.data.username, user.id)) {
    res.status(409).json({ error: "Uporabniško ime je že zasedeno." });
    return;
  }

  const fields = ["username = @username"];
  const params: Record<string, unknown> = { id: user.id, username: parsed.data.username };
  if (parsed.data.password) {
    fields.push("password_hash = @passwordHash");
    params.passwordHash = hashPassword(parsed.data.password);
  }

  sqlite.prepare(`UPDATE users SET ${fields.join(", ")} WHERE id = @id`).run(params);

  res.json(toDto(user.id));
});
