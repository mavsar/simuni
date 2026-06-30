import type Database from "better-sqlite3";

import { hashPassword } from "./passwords.js";

const DEFAULT_ADMIN = {
  username: "admin",
  password: "admin",
  familyName: "Administrator"
};

/**
 * Seed a default admin the first time the app runs so there is always a way in.
 * Skipped as soon as any family exists. The credentials should be changed via
 * the Družine page after the first login.
 */
export function ensureDefaultAdmin(sqlite: Database.Database): void {
  const { count } = sqlite.prepare("SELECT COUNT(*) AS count FROM users").get() as {
    count: number;
  };

  if (count > 0) {
    return;
  }

  sqlite
    .prepare(
      `INSERT INTO users (username, password_hash, family_name, role)
       VALUES (?, ?, ?, 'admin')`
    )
    .run(DEFAULT_ADMIN.username, hashPassword(DEFAULT_ADMIN.password), DEFAULT_ADMIN.familyName);

  console.log(
    `Seeded default admin (username: "${DEFAULT_ADMIN.username}", password: "${DEFAULT_ADMIN.password}"). Change it from the Družine page.`
  );
}
