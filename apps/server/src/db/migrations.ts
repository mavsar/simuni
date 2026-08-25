import type Database from "better-sqlite3";

type Migration = {
  name: string;
  sql: string;
};

const migrations: Migration[] = [
  {
    name: "0001_pricing_and_availability",
    sql: `
      CREATE TABLE settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        pausal_price REAL NOT NULL DEFAULT 0,
        oneoff_discount_percent REAL NOT NULL DEFAULT 0
      );

      INSERT INTO settings (id, pausal_price, oneoff_discount_percent)
      VALUES (1, 0, 0);

      CREATE TABLE occupied_days (
        day TEXT PRIMARY KEY
      );
    `
  },
  {
    name: "0002_users_and_sessions",
    sql: `
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE sessions (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `
  },
  {
    name: "0003_reservations",
    sql: `
      CREATE TABLE reservations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        start_day TEXT NOT NULL,
        end_day TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CHECK (start_day <= end_day)
      );

      CREATE INDEX idx_reservations_user ON reservations (user_id);
      CREATE INDEX idx_reservations_range ON reservations (start_day, end_day);
    `
  },
  {
    name: "0004_families_and_persons",
    sql: `
      ALTER TABLE users ADD COLUMN family_name TEXT NOT NULL DEFAULT '';
      UPDATE users SET family_name = TRIM(first_name || ' ' || last_name);
      ALTER TABLE users DROP COLUMN first_name;
      ALTER TABLE users DROP COLUMN last_name;

      CREATE TABLE persons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        family_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        birthday TEXT NOT NULL,
        na_pausalu INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_persons_family ON persons (family_id);
    `
  },
  {
    name: "0005_reservation_persons",
    sql: `
      CREATE TABLE reservation_persons (
        reservation_id INTEGER NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
        person_id INTEGER NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
        PRIMARY KEY (reservation_id, person_id)
      );

      CREATE INDEX idx_reservation_persons_reservation ON reservation_persons (reservation_id);
    `
  },
  {
    name: "0006_tourist_tax_and_seasons",
    sql: `
      ALTER TABLE settings ADD COLUMN tourist_tax REAL NOT NULL DEFAULT 1.5;

      CREATE TABLE seasons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL DEFAULT '',
        start_month INTEGER NOT NULL,
        start_day INTEGER NOT NULL,
        end_month INTEGER NOT NULL,
        end_day INTEGER NOT NULL,
        price_adult REAL NOT NULL DEFAULT 0,
        price_adult_senior REAL NOT NULL DEFAULT 0,
        price_child_0_2 REAL NOT NULL DEFAULT 0,
        price_child_3_5 REAL NOT NULL DEFAULT 0,
        price_child_6_11 REAL NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0
      );

      INSERT INTO seasons
        (name, start_month, start_day, end_month, end_day,
         price_adult, price_adult_senior, price_child_0_2, price_child_3_5, price_child_6_11, sort_order)
      VALUES
        ('15.03.–24.04.', 3, 15, 4, 24, 3.50, 2.50, 0, 0, 0, 1),
        ('25.04.–15.05.', 4, 25, 5, 15, 6.50, 5.50, 0, 0, 4.50, 2),
        ('16.05.–22.05.', 5, 16, 5, 22, 11.00, 8.50, 0, 0, 5.00, 3),
        ('23.05.–19.06.', 5, 23, 6, 19, 11.75, 9.25, 0, 0, 5.75, 4),
        ('20.06.–10.07.', 6, 20, 7, 10, 12.50, 11.00, 0, 7.00, 7.20, 5),
        ('11.07.–21.08.', 7, 11, 8, 21, 13.50, 12.00, 0, 7.50, 8.20, 6),
        ('22.08.–28.08.', 8, 22, 8, 28, 12.50, 11.00, 0, 7.00, 7.20, 7),
        ('29.08.–11.09.', 8, 29, 9, 11, 11.00, 8.50, 0, 0, 5.75, 8),
        ('12.09.–25.09.', 9, 12, 9, 25, 6.50, 5.50, 0, 0, 4.50, 9),
        ('26.09.–15.11.', 9, 26, 11, 15, 3.50, 2.50, 0, 0, 0, 10);
    `
  },
  {
    // Seasons originally shared a boundary day (one ended on the next one's start
    // day), which made that day ambiguous. Shift each end to the day before the
    // next season begins so ranges no longer overlap. Guarded on the old end
    // values so any season already edited by hand is left untouched.
    name: "0007_non_overlapping_seasons",
    sql: `
      UPDATE seasons SET end_month = 4, end_day = 24, name = '15.03.–24.04.'
        WHERE sort_order = 1 AND end_month = 4 AND end_day = 25;
      UPDATE seasons SET end_month = 5, end_day = 15, name = '25.04.–15.05.'
        WHERE sort_order = 2 AND end_month = 5 AND end_day = 16;
      UPDATE seasons SET end_month = 5, end_day = 22, name = '16.05.–22.05.'
        WHERE sort_order = 3 AND end_month = 5 AND end_day = 23;
      UPDATE seasons SET end_month = 6, end_day = 19, name = '23.05.–19.06.'
        WHERE sort_order = 4 AND end_month = 6 AND end_day = 20;
      UPDATE seasons SET end_month = 7, end_day = 10, name = '20.06.–10.07.'
        WHERE sort_order = 5 AND end_month = 7 AND end_day = 11;
      UPDATE seasons SET end_month = 8, end_day = 21, name = '11.07.–21.08.'
        WHERE sort_order = 6 AND end_month = 8 AND end_day = 22;
      UPDATE seasons SET end_month = 8, end_day = 28, name = '22.08.–28.08.'
        WHERE sort_order = 7 AND end_month = 8 AND end_day = 29;
      UPDATE seasons SET end_month = 9, end_day = 11, name = '29.08.–11.09.'
        WHERE sort_order = 8 AND end_month = 9 AND end_day = 12;
      UPDATE seasons SET end_month = 9, end_day = 25, name = '12.09.–25.09.'
        WHERE sort_order = 9 AND end_month = 9 AND end_day = 26;
    `
  },
  {
    name: "0008_cars",
    sql: `
      CREATE TABLE cars (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        family_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        registration_plate TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_cars_family ON cars (family_id);
    `
  },
  {
    // Identity document per person: a type (id_card | drivers_license | passport)
    // and the document number. Existing rows default to an ID card with no number.
    name: "0009_person_id_document",
    sql: `
      ALTER TABLE persons ADD COLUMN id_type TEXT NOT NULL DEFAULT 'id_card';
      ALTER TABLE persons ADD COLUMN id_number TEXT NOT NULL DEFAULT '';
    `
  },
  {
    name: "0010_reservation_cars",
    sql: `
      CREATE TABLE reservation_cars (
        reservation_id INTEGER NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
        car_id INTEGER NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
        PRIMARY KEY (reservation_id, car_id)
      );

      CREATE INDEX idx_reservation_cars_reservation ON reservation_cars (reservation_id);
    `
  },
  {
    // One-time per-reservation accommodation payment ("Enkratno plačilo
    // nastanitve"), charged once per attendee — not per night.
    name: "0011_accommodation_fee",
    sql: `
      ALTER TABLE settings ADD COLUMN accommodation_fee REAL NOT NULL DEFAULT 1.5;
    `
  },
  {
    // Age below which a person is exempt from tourist tax ("Turistična
    // taksa"). Persons younger than this many whole years don't pay it.
    name: "0012_tourist_tax_exempt_age",
    sql: `
      ALTER TABLE settings ADD COLUMN tourist_tax_exempt_age INTEGER NOT NULL DEFAULT 12;
    `
  },
  {
    // How a family paid Šimuni camp for a finished stay: '' (not answered
    // yet), 'reception' (paid on check-out), or 'with_bungalov' (deferred to
    // be settled together with the bungalov payment). Whether the bungalov
    // payment itself has been settled is tracked separately — admins mark it.
    name: "0013_reservation_payment",
    sql: `
      ALTER TABLE reservations ADD COLUMN simuni_payment TEXT NOT NULL DEFAULT '';
      ALTER TABLE reservations ADD COLUMN bungalov_paid INTEGER NOT NULL DEFAULT 0;
    `
  },
  {
    // Pricing is decided per calendar year: every value that lived in the
    // single-row `settings` table, and every season, is now scoped by year.
    // `prices_confirmed_at` locks a year once an admin has settled its
    // prices; NULL means still open. Confirming also snapshots each
    // reservation's amounts in that year (reservation_price_snapshots), so a
    // later booking change can never move an already-confirmed family's bill.
    name: "0014_per_year_pricing",
    sql: `
      CREATE TABLE year_settings (
        year INTEGER PRIMARY KEY,
        pausal_price REAL NOT NULL DEFAULT 0,
        oneoff_discount_percent REAL NOT NULL DEFAULT 0,
        tourist_tax REAL NOT NULL DEFAULT 1.5,
        accommodation_fee REAL NOT NULL DEFAULT 1.5,
        tourist_tax_exempt_age INTEGER NOT NULL DEFAULT 12,
        prices_confirmed_at TEXT,
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      INSERT INTO year_settings
        (year, pausal_price, oneoff_discount_percent, tourist_tax,
         accommodation_fee, tourist_tax_exempt_age, prices_confirmed_at)
      SELECT 2026, pausal_price, oneoff_discount_percent, tourist_tax,
             accommodation_fee, tourist_tax_exempt_age, NULL
      FROM settings
      WHERE id = 1;

      INSERT OR IGNORE INTO year_settings (year) VALUES (2026);

      DROP TABLE settings;

      ALTER TABLE seasons ADD COLUMN year INTEGER NOT NULL DEFAULT 2026;
      CREATE INDEX idx_seasons_year ON seasons (year, sort_order);

      CREATE TABLE reservation_price_snapshots (
        reservation_id INTEGER PRIMARY KEY REFERENCES reservations(id) ON DELETE CASCADE,
        year INTEGER NOT NULL,
        bungalov_amount REAL NOT NULL,
        simuni_amount REAL NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE INDEX idx_snapshots_year ON reservation_price_snapshots (year);
    `
  },
  {
    // Dropped the family self-report flow for how Šimuni was paid (on
    // check-out vs. deferred). Only the admin-set "bungalov paid" flag
    // remains.
    name: "0015_remove_simuni_payment",
    sql: `
      ALTER TABLE reservations DROP COLUMN simuni_payment;
    `
  },
  {
    // Admin-visible audit trail for reservation edits: who changed what, and
    // when. `changes` is a JSON blob whose shape depends on `action`
    // ('created' | 'updated' | 'payment'). Deleting the reservation (or the
    // acting user) cascades its history away — there is nothing left to show
    // it against once the reservation itself is gone.
    name: "0016_reservation_history",
    sql: `
      CREATE TABLE reservation_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reservation_id INTEGER NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        action TEXT NOT NULL,
        changes TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      CREATE INDEX idx_reservation_history_reservation ON reservation_history (reservation_id, created_at);
    `
  },
  {
    // A family's contact address for the "prices confirmed" email, and a
    // hidden admin-only flag for families who don't pay the bungalov share:
    // they never see a bungalov amount and are skipped when that email goes
    // out. Not UNIQUE — most rows start out blank.
    name: "0017_family_email_and_payment_exclusion",
    sql: `
      ALTER TABLE users ADD COLUMN email TEXT NOT NULL DEFAULT '';
      ALTER TABLE users ADD COLUMN payment_excluded INTEGER NOT NULL DEFAULT 0;
    `
  },
  {
    // Admin-editable overrides for the app's automated emails. A missing row
    // means "use the built-in default" — only a row here means an admin has
    // customized that email's subject/body.
    name: "0018_email_templates",
    sql: `
      CREATE TABLE email_templates (
        type TEXT PRIMARY KEY,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
    `
  },
  {
    // A fixed address some templates always send to (e.g. the camping
    // reception for the online-reservation notice) — distinct from a
    // family's own contact email. Blank for templates that don't need one.
    name: "0019_email_template_recipient",
    sql: `
      ALTER TABLE email_templates ADD COLUMN recipient TEXT NOT NULL DEFAULT '';
    `
  },
  {
    // Dedup/catch-up ledger for the "online reservation" reminder: a row
    // means that reservation's notice has already gone out, so a daily
    // catch-up check never sends it twice.
    name: "0020_reservation_reminders",
    sql: `
      CREATE TABLE reservation_reminders (
        reservation_id INTEGER PRIMARY KEY REFERENCES reservations(id) ON DELETE CASCADE,
        sent_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
    `
  },
  {
    // When an admin last opened this reservation's history — drives the
    // unseen-event badge on the history button. NULL means never viewed, so
    // every existing entry counts as unseen until someone actually looks.
    name: "0021_reservation_history_viewed_at",
    sql: `
      ALTER TABLE reservations ADD COLUMN history_viewed_at TEXT;
    `
  },
  {
    // Superseding 0021: "last viewed" needs to be per-viewer, not one
    // reservation-wide timestamp — otherwise any single family or admin
    // opening the history modal would clear everyone else's unseen badge
    // too. Each (reservation, user) pair now tracks its own view.
    name: "0022_reservation_history_views",
    sql: `
      CREATE TABLE reservation_history_views (
        reservation_id INTEGER NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        viewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        PRIMARY KEY (reservation_id, user_id)
      );

      ALTER TABLE reservations DROP COLUMN history_viewed_at;
    `
  },
  {
    // Per-reservation choice: 'online' means the family wants the automated
    // online-reservation notice (sent 1 week before check-in) and only has
    // to visit reception at checkout; 'manual' opts out — they'll check
    // in/out at reception themselves. Defaults to 'online' so every existing
    // reservation keeps getting the notice exactly as it already did, since
    // that was every reservation's behavior before this choice existed.
    name: "0023_reservation_checkin_mode",
    sql: `
      ALTER TABLE reservations ADD COLUMN checkin_mode TEXT NOT NULL DEFAULT 'online';
    `
  },
  {
    // Extra admin-configured BCC addresses for a template's fixed recipient
    // (e.g. the online-reservation email to reception) — comma-separated,
    // in addition to whatever the send site already BCCs (e.g. the family).
    name: "0024_email_template_bcc",
    sql: `
      ALTER TABLE email_templates ADD COLUMN bcc TEXT NOT NULL DEFAULT '';
    `
  }
];

export function runMigrations(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS app_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const hasMigration = sqlite.prepare("SELECT 1 FROM app_migrations WHERE name = ? LIMIT 1");
  const insertMigration = sqlite.prepare("INSERT INTO app_migrations (name) VALUES (?)");

  for (const migration of migrations) {
    if (hasMigration.get(migration.name)) {
      continue;
    }

    const applyMigration = sqlite.transaction(() => {
      sqlite.exec(migration.sql);
      insertMigration.run(migration.name);
    });

    applyMigration();
  }
}
