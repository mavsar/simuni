import type { NextFunction, Request, Response } from "express";

import { sqlite } from "../db/client.js";

export type Role = "admin" | "user";

export type AuthUser = {
  id: number;
  username: string;
  familyName: string;
  role: Role;
};

export type AuthedRequest = Request & { user?: AuthUser };

type SessionRow = {
  id: number;
  username: string;
  family_name: string;
  role: Role;
};

const selectSessionUser = sqlite.prepare(
  `SELECT u.id, u.username, u.family_name, u.role
   FROM sessions s
   JOIN users u ON u.id = s.user_id
   WHERE s.token = ?`
);

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    return header.slice("Bearer ".length).trim() || null;
  }
  return null;
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "Potrebna je prijava." });
    return;
  }

  const row = selectSessionUser.get(token) as SessionRow | undefined;
  if (!row) {
    res.status(401).json({ error: "Seja je potekla. Prijavite se znova." });
    return;
  }

  (req as AuthedRequest).user = {
    id: row.id,
    username: row.username,
    familyName: row.family_name,
    role: row.role
  };
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const user = (req as AuthedRequest).user;
  if (!user || user.role !== "admin") {
    res.status(403).json({ error: "Samo administratorji imajo dostop." });
    return;
  }
  next();
}
