import { Router } from "express";
import { z } from "zod";

import { authenticate, requireAdmin } from "../auth/middleware.js";
import { sqlite } from "../db/client.js";

export const settingsRouter = Router();

settingsRouter.use(authenticate);

/** Earliest year the app prices. Mirrored in apps/web/src/lib/pricing.ts. */
const MIN_SETTINGS_YEAR = 2026;

/** Latest configurable year — always next year, so it rolls forward on its own. */
function maxSettingsYear(): number {
  return new Date().getFullYear() + 1;
}

type YearRow = {
  year: number;
  pausal_price: number;
  oneoff_discount_percent: number;
  tourist_tax: number;
  accommodation_fee: number;
  tourist_tax_exempt_age: number;
  prices_confirmed_at: string | null;
  updated_at: string;
};

type SeasonRow = {
  id: number;
  name: string;
  start_month: number;
  start_day: number;
  end_month: number;
  end_day: number;
  price_adult: number;
  price_adult_senior: number;
  price_child_0_2: number;
  price_child_3_5: number;
  price_child_6_11: number;
  sort_order: number;
};

type SnapshotRow = {
  reservation_id: number;
  bungalov_amount: number;
  simuni_amount: number;
};

const selectYear = sqlite.prepare(`SELECT * FROM year_settings WHERE year = ?`);
const selectAllYears = sqlite.prepare(`SELECT * FROM year_settings ORDER BY year`);

const upsertYear = sqlite.prepare(
  `INSERT INTO year_settings
     (year, pausal_price, oneoff_discount_percent, tourist_tax,
      accommodation_fee, tourist_tax_exempt_age, updated_at)
   VALUES
     (@year, @pausalPrice, @oneoffDiscountPercent, @touristTax,
      @accommodationFee, @touristTaxExemptAge, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
   ON CONFLICT (year) DO UPDATE SET
     pausal_price = excluded.pausal_price,
     oneoff_discount_percent = excluded.oneoff_discount_percent,
     tourist_tax = excluded.tourist_tax,
     accommodation_fee = excluded.accommodation_fee,
     tourist_tax_exempt_age = excluded.tourist_tax_exempt_age,
     updated_at = excluded.updated_at`
);

const markConfirmed = sqlite.prepare(
  `UPDATE year_settings
   SET prices_confirmed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
   WHERE year = ?`
);
const clearConfirmation = sqlite.prepare(
  `UPDATE year_settings
   SET prices_confirmed_at = NULL,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
   WHERE year = ?`
);

const selectSeasonsForYear = sqlite.prepare(
  `SELECT id, name, start_month, start_day, end_month, end_day,
          price_adult, price_adult_senior, price_child_0_2, price_child_3_5, price_child_6_11, sort_order
   FROM seasons
   WHERE year = ?
   ORDER BY sort_order, id`
);
const deleteSeasonsForYear = sqlite.prepare("DELETE FROM seasons WHERE year = ?");
const insertSeason = sqlite.prepare(
  `INSERT INTO seasons
     (year, name, start_month, start_day, end_month, end_day,
      price_adult, price_adult_senior, price_child_0_2, price_child_3_5,
      price_child_6_11, sort_order)
   VALUES
     (@year, @name, @startMonth, @startDay, @endMonth, @endDay,
      @priceAdult, @priceAdultSenior, @priceChild0_2, @priceChild3_5,
      @priceChild6_11, @sortOrder)`
);

const selectSnapshotsForYear = sqlite.prepare(
  `SELECT reservation_id, bungalov_amount, simuni_amount
   FROM reservation_price_snapshots
   WHERE year = ?`
);
const deleteSnapshotsForYear = sqlite.prepare(
  "DELETE FROM reservation_price_snapshots WHERE year = ?"
);
const insertSnapshot = sqlite.prepare(
  `INSERT INTO reservation_price_snapshots (reservation_id, year, bungalov_amount, simuni_amount)
   VALUES (@reservationId, @year, @bungalovAmount, @simuniAmount)`
);

function seasonToDto(row: SeasonRow) {
  return {
    id: row.id,
    name: row.name,
    startMonth: row.start_month,
    startDay: row.start_day,
    endMonth: row.end_month,
    endDay: row.end_day,
    priceAdult: row.price_adult,
    priceAdultSenior: row.price_adult_senior,
    priceChild0_2: row.price_child_0_2,
    priceChild3_5: row.price_child_3_5,
    priceChild6_11: row.price_child_6_11
  };
}

function snapshotToDto(row: SnapshotRow) {
  return {
    reservationId: row.reservation_id,
    bungalov: row.bungalov_amount,
    simuni: row.simuni_amount
  };
}

function yearRowToDto(row: YearRow, stored: boolean) {
  const confirmed = row.prices_confirmed_at !== null;
  return {
    year: row.year,
    pausalPrice: row.pausal_price,
    oneoffDiscountPercent: row.oneoff_discount_percent,
    touristTax: row.tourist_tax,
    accommodationFee: row.accommodation_fee,
    touristTaxExemptAge: row.tourist_tax_exempt_age,
    pricesConfirmed: confirmed,
    pricesConfirmedAt: row.prices_confirmed_at,
    stored,
    updatedAt: row.updated_at,
    seasons: (selectSeasonsForYear.all(row.year) as SeasonRow[]).map(seasonToDto),
    snapshots: confirmed
      ? (selectSnapshotsForYear.all(row.year) as SnapshotRow[]).map(snapshotToDto)
      : []
  };
}

function readStoredYears(): Map<number, YearRow> {
  const rows = selectAllYears.all() as YearRow[];
  return new Map(rows.map((row) => [row.year, row]));
}

/**
 * A year without its own row inherits the nearest earlier stored year — the
 * "carry last year's prices forward" rule. Anything before the first stored
 * year borrows that first year instead, so the lookup never misses. A
 * synthesized year is never confirmed and carries no snapshots: only a
 * persisted, confirmed year can have either.
 */
function materialiseYear(year: number, stored: Map<number, YearRow>) {
  const own = stored.get(year);
  if (own) return yearRowToDto(own, true);

  const years = [...stored.keys()].sort((a, b) => a - b);
  const earlier = years.filter((y) => y < year).pop();
  const source = stored.get(earlier ?? years[0]);
  if (!source) {
    return {
      year,
      pausalPrice: 0,
      oneoffDiscountPercent: 0,
      touristTax: 0,
      accommodationFee: 0,
      touristTaxExemptAge: 0,
      pricesConfirmed: false,
      pricesConfirmedAt: null,
      stored: false,
      updatedAt: null,
      seasons: [],
      snapshots: []
    };
  }

  const dto = yearRowToDto(source, false);
  return {
    ...dto,
    year,
    pricesConfirmed: false,
    pricesConfirmedAt: null,
    stored: false,
    // Inherited seasons carry no id — they aren't persisted rows.
    seasons: dto.seasons.map(({ id: _id, ...rest }) => rest),
    snapshots: []
  };
}

/**
 * Every year the app shows: the configurable window (2026 … next year) plus
 * any year that already has stored rows, so a year can never disappear from
 * the list once it exists.
 */
function readAllYears() {
  const stored = readStoredYears();
  const wanted = new Set<number>(stored.keys());
  for (let y = MIN_SETTINGS_YEAR; y <= maxSettingsYear(); y += 1) wanted.add(y);
  return [...wanted].sort((a, b) => a - b).map((year) => materialiseYear(year, stored));
}

const seasonSchema = z.object({
  name: z.string().max(120).default(""),
  startMonth: z.number().int().min(1).max(12),
  startDay: z.number().int().min(1).max(31),
  endMonth: z.number().int().min(1).max(12),
  endDay: z.number().int().min(1).max(31),
  priceAdult: z.number().min(0),
  priceAdultSenior: z.number().min(0),
  priceChild0_2: z.number().min(0),
  priceChild3_5: z.number().min(0),
  priceChild6_11: z.number().min(0)
});

/** Body of PUT /api/settings/:year — identical to the pre-per-year payload. */
const yearSettingsSchema = z.object({
  pausalPrice: z.number().min(0),
  oneoffDiscountPercent: z.number().min(0).max(100),
  touristTax: z.number().min(0),
  accommodationFee: z.number().min(0),
  touristTaxExemptAge: z.number().int().min(0),
  seasons: z.array(seasonSchema).default([])
});

const confirmSchema = z.object({
  snapshots: z
    .array(
      z.object({
        reservationId: z.number().int().positive(),
        bungalov: z.number().min(0),
        simuni: z.number().min(0)
      })
    )
    .default([])
});

function parseYearParam(raw: unknown) {
  return z
    .coerce
    .number()
    .int()
    .min(MIN_SETTINGS_YEAR, { message: `Cene se vodijo od leta ${MIN_SETTINGS_YEAR} naprej.` })
    .refine((year) => year <= maxSettingsYear(), {
      message: "Cene se lahko določijo največ za naslednje leto."
    })
    .safeParse(raw);
}

type YearSettingsInput = z.infer<typeof yearSettingsSchema>;

const persistYear = sqlite.transaction((year: number, data: YearSettingsInput) => {
  upsertYear.run({
    year,
    pausalPrice: data.pausalPrice,
    oneoffDiscountPercent: data.oneoffDiscountPercent,
    touristTax: data.touristTax,
    accommodationFee: data.accommodationFee,
    touristTaxExemptAge: data.touristTaxExemptAge
  });
  deleteSeasonsForYear.run(year);
  data.seasons.forEach((season, index) => {
    insertSeason.run({ year, ...season, sortOrder: index + 1 });
  });
});

type SnapshotInput = z.infer<typeof confirmSchema>["snapshots"];

const confirmYear = sqlite.transaction((year: number, snapshots: SnapshotInput) => {
  // A year the admin never edited is still confirmable: materialise the
  // inherited values first, so the lock freezes something concrete rather
  // than a value that would keep drifting with the previous year.
  if (!selectYear.get(year)) {
    const inherited = materialiseYear(year, readStoredYears());
    persistYear(year, inherited);
  }
  deleteSnapshotsForYear.run(year);
  for (const snapshot of snapshots) {
    insertSnapshot.run({
      reservationId: snapshot.reservationId,
      year,
      bungalovAmount: snapshot.bungalov,
      simuniAmount: snapshot.simuni
    });
  }
  markConfirmed.run(year);
});

const unlockYear = sqlite.transaction((year: number) => {
  clearConfirmation.run(year);
  deleteSnapshotsForYear.run(year);
});

settingsRouter.get("/", (_req, res) => {
  res.json({ years: readAllYears() });
});

settingsRouter.put("/:year", requireAdmin, (req, res) => {
  const year = parseYearParam(req.params.year);
  if (!year.success) {
    res.status(400).json({ error: year.error.issues[0]?.message ?? "Neveljavno leto." });
    return;
  }

  const parsed = yearSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid settings", details: parsed.error.flatten() });
    return;
  }

  // The lock is enforced here, not just by disabled inputs client-side.
  const existing = selectYear.get(year.data) as YearRow | undefined;
  if (existing?.prices_confirmed_at) {
    res.status(409).json({ error: "Cene za to leto so potrjene. Najprej jih odkleni." });
    return;
  }

  persistYear(year.data, parsed.data);
  res.json({ years: readAllYears() });
});

settingsRouter.post("/:year/confirm", requireAdmin, (req, res) => {
  const year = parseYearParam(req.params.year);
  if (!year.success) {
    res.status(400).json({ error: year.error.issues[0]?.message ?? "Neveljavno leto." });
    return;
  }

  const parsed = confirmSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid snapshots", details: parsed.error.flatten() });
    return;
  }

  confirmYear(year.data, parsed.data.snapshots);
  res.json({ years: readAllYears() });
});

settingsRouter.post("/:year/unlock", requireAdmin, (req, res) => {
  const year = parseYearParam(req.params.year);
  if (!year.success) {
    res.status(400).json({ error: year.error.issues[0]?.message ?? "Neveljavno leto." });
    return;
  }

  unlockYear(year.data);
  res.json({ years: readAllYears() });
});
