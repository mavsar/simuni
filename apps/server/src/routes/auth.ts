import { randomBytes } from "node:crypto";

import { Router } from "express";
import { z } from "zod";

import { authenticate, type AuthedRequest, type Role } from "../auth/middleware.js";
import { verifyPassword } from "../auth/passwords.js";
import { sqlite } from "../db/client.js";
import { carsForFamily, personsForFamily } from "../db/familyMembers.js";

export const authRouter = Router();

type UserRow = {
  id: number;
  username: string;
  password_hash: string;
  family_name: string;
  role: Role;
};

const selectByUsername = sqlite.prepare("SELECT * FROM users WHERE username = ?");
const insertSession = sqlite.prepare("INSERT INTO sessions (token, user_id) VALUES (?, ?)");
const deleteSession = sqlite.prepare("DELETE FROM sessions WHERE token = ?");

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

authRouter.post("/login", (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Vnesite uporabniško ime in geslo." });
    return;
  }

  const user = selectByUsername.get(parsed.data.username) as UserRow | undefined;
  if (!user || !verifyPassword(parsed.data.password, user.password_hash)) {
    res.status(401).json({ error: "Napačno uporabniško ime ali geslo." });
    return;
  }

  const token = randomBytes(32).toString("hex");
  insertSession.run(token, user.id);

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      familyName: user.family_name,
      role: user.role,
      persons: personsForFamily(user.id),
      cars: carsForFamily(user.id)
    }
  });
});

authRouter.post("/logout", authenticate, (req, res) => {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : null;
  if (token) {
    deleteSession.run(token);
  }
  res.status(204).end();
});

authRouter.get("/me", authenticate, (req, res) => {
  const user = (req as AuthedRequest).user;
  if (!user) {
    res.status(401).json({ error: "Potrebna je prijava." });
    return;
  }
  res.json({ ...user, persons: personsForFamily(user.id), cars: carsForFamily(user.id) });
});
