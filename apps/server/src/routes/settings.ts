import { Router } from "express";
import { z } from "zod";

import { authenticate } from "../auth/middleware.js";
import { sqlite } from "../db/client.js";

export const settingsRouter = Router();

settingsRouter.use(authenticate);

type SettingsRow = {
  pausal_price: number;
  oneoff_discount_percent: number;
  tourist_tax: number;
  accommodation_fee: number;
  tourist_tax_exempt_age: number;
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

const selectSettings = sqlite.prepare(
  `SELECT pausal_price, oneoff_discount_percent, tourist_tax, accommodation_fee, tourist_tax_exempt_age
   FROM settings WHERE id = 1`
);

const updateSettings = sqlite.prepare(
  `UPDATE settings
   SET pausal_price = @pausalPrice,
       oneoff_discount_percent = @oneoffDiscountPercent,
       tourist_tax = @touristTax,
       accommodation_fee = @accommodationFee,
       tourist_tax_exempt_age = @touristTaxExemptAge
   WHERE id = 1`
);

const selectSeasons = sqlite.prepare(
  `SELECT id, name, start_month, start_day, end_month, end_day,
          price_adult, price_adult_senior, price_child_0_2, price_child_3_5, price_child_6_11, sort_order
   FROM seasons
   ORDER BY sort_order, id`
);

const deleteSeasons = sqlite.prepare("DELETE FROM seasons");

const insertSeason = sqlite.prepare(
  `INSERT INTO seasons
     (name, start_month, start_day, end_month, end_day,
      price_adult, price_adult_senior, price_child_0_2, price_child_3_5, price_child_6_11, sort_order)
   VALUES
     (@name, @startMonth, @startDay, @endMonth, @endDay,
      @priceAdult, @priceAdultSenior, @priceChild0_2, @priceChild3_5, @priceChild6_11, @sortOrder)`
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

function readSettings() {
  const row = selectSettings.get() as SettingsRow;
  const seasons = (selectSeasons.all() as SeasonRow[]).map(seasonToDto);
  return {
    pausalPrice: row.pausal_price,
    oneoffDiscountPercent: row.oneoff_discount_percent,
    touristTax: row.tourist_tax,
    accommodationFee: row.accommodation_fee,
    touristTaxExemptAge: row.tourist_tax_exempt_age,
    seasons
  };
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

const settingsSchema = z.object({
  pausalPrice: z.number().min(0),
  oneoffDiscountPercent: z.number().min(0).max(100),
  touristTax: z.number().min(0),
  accommodationFee: z.number().min(0),
  touristTaxExemptAge: z.number().int().min(0),
  seasons: z.array(seasonSchema).default([])
});

settingsRouter.get("/", (_req, res) => {
  res.json(readSettings());
});

settingsRouter.put("/", (req, res) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid settings", details: parsed.error.flatten() });
    return;
  }

  const save = sqlite.transaction(() => {
    updateSettings.run({
      pausalPrice: parsed.data.pausalPrice,
      oneoffDiscountPercent: parsed.data.oneoffDiscountPercent,
      touristTax: parsed.data.touristTax,
      accommodationFee: parsed.data.accommodationFee,
      touristTaxExemptAge: parsed.data.touristTaxExemptAge
    });

    deleteSeasons.run();
    parsed.data.seasons.forEach((season, index) => {
      insertSeason.run({
        name: season.name,
        startMonth: season.startMonth,
        startDay: season.startDay,
        endMonth: season.endMonth,
        endDay: season.endDay,
        priceAdult: season.priceAdult,
        priceAdultSenior: season.priceAdultSenior,
        priceChild0_2: season.priceChild0_2,
        priceChild3_5: season.priceChild3_5,
        priceChild6_11: season.priceChild6_11,
        sortOrder: index + 1
      });
    });
  });

  save();

  res.json(readSettings());
});
