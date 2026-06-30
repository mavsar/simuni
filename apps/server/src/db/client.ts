import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import { ensureDefaultAdmin } from "../auth/bootstrap.js";
import { runMigrations } from "./migrations.js";

const databasePath = process.env.DATABASE_PATH ?? path.resolve(process.cwd(), "data", "simuni.db");

const databaseDirectory = path.dirname(databasePath);
if (!fs.existsSync(databaseDirectory)) {
  fs.mkdirSync(databaseDirectory, { recursive: true });
}

export const sqlite = new Database(databasePath);

sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

runMigrations(sqlite);
ensureDefaultAdmin(sqlite);
