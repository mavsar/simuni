import { Router } from "express";
import { z } from "zod";

import { authenticate, requireAdmin } from "../auth/middleware.js";
import { sqlite } from "../db/client.js";
import { getEffectiveTemplate, resetTemplate, saveTemplate } from "../mail/emailTemplateStore.js";
import { sendMail } from "../mail/mailer.js";
import { EMAIL_TEMPLATE_DEFINITIONS, renderTemplate, type EmailTemplateDefinition } from "../mail/templates.js";
import { translateToCroatian } from "../mail/translate.js";

export const emailTemplatesRouter = Router();

emailTemplatesRouter.use(authenticate, requireAdmin);

function findDefinition(type: string): EmailTemplateDefinition | undefined {
  return EMAIL_TEMPLATE_DEFINITIONS.find((def) => def.type === type);
}

function toDto(def: EmailTemplateDefinition) {
  const effective = getEffectiveTemplate(def);
  return {
    type: def.type,
    label: def.label,
    description: def.description,
    placeholders: def.placeholders,
    sampleValues: def.sampleValues,
    subject: effective.subject,
    body: effective.body,
    recipient: effective.recipient,
    bcc: effective.bcc,
    recipientLabel: def.recipientLabel ?? null,
    isCustomized: effective.isCustomized,
    updatedAt: effective.updatedAt
  };
}

emailTemplatesRouter.get("/", (_req, res) => {
  res.json({ templates: EMAIL_TEMPLATE_DEFINITIONS.map(toDto) });
});

const EMAIL_ADDRESS_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Comma-separated list of email addresses; every non-empty entry must look like an address. */
const bccListSchema = z
  .string()
  .trim()
  .max(1000)
  .default("")
  .refine(
    (value) => value.split(",").every((entry) => entry.trim() === "" || EMAIL_ADDRESS_RE.test(entry.trim())),
    { message: "Neveljaven naslov v seznamu skritih kopij (BCC)." }
  );

const updateSchema = z.object({
  subject: z.string().trim().min(1, "Zadeva ne sme biti prazna.").max(300),
  body: z.string().trim().min(1, "Besedilo ne sme biti prazno.").max(20000),
  recipient: z.string().trim().max(200).default(""),
  bcc: bccListSchema
});

emailTemplatesRouter.put("/:type", (req, res) => {
  const def = findDefinition(req.params.type);
  if (!def) {
    res.status(404).json({ error: "Neznana predloga e-pošte." });
    return;
  }

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Neveljavna predloga." });
    return;
  }

  saveTemplate(def.type, parsed.data.subject, parsed.data.body, parsed.data.recipient, parsed.data.bcc);
  res.json(toDto(def));
});

emailTemplatesRouter.post("/:type/reset", (req, res) => {
  const def = findDefinition(req.params.type);
  if (!def) {
    res.status(404).json({ error: "Neznana predloga e-pošte." });
    return;
  }

  resetTemplate(def.type);
  res.json(toDto(def));
});

const testSendSchema = z.object({
  to: z.string().trim().email("Neveljaven e-poštni naslov."),
  familyId: z.number().int().positive(),
  subject: z.string().trim().min(1, "Zadeva ne sme biti prazna.").max(300),
  body: z.string().trim().min(1, "Besedilo ne sme biti prazno.").max(20000),
  // Real per-family placeholder values computed client-side (same data the
  // preview shows), so the test reflects what would actually be sent.
  // Missing/omitted for a family the client couldn't compute real data for.
  vars: z.record(z.string(), z.string()).default({})
});

const selectFamilyById = sqlite.prepare(
  `SELECT id, family_name, email FROM users WHERE id = ?`
);

/**
 * Sends the given (possibly unsaved) draft to an admin-chosen recipient,
 * rendered as if the admin-chosen family were the one receiving it: real
 * per-family data when the client could compute it (same values the preview
 * shows), falling back to the template's generic sample data for whichever
 * placeholders it couldn't. The subject is tagged so it's obviously not the
 * real notification. Never BCCs anyone — a test must never quietly loop in
 * a real family's inbox. `familyName` always comes from the database, never
 * the client, regardless of `vars`; the recipient is always the address the
 * admin typed, never resolved from the family (which may not even have one).
 */
emailTemplatesRouter.post("/:type/test", async (req, res) => {
  const def = findDefinition(req.params.type);
  if (!def) {
    res.status(404).json({ error: "Neznana predloga e-pošte." });
    return;
  }

  const parsed = testSendSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Neveljaven zahtevek." });
    return;
  }

  const family = selectFamilyById.get(parsed.data.familyId) as
    | { id: number; family_name: string; email: string }
    | undefined;
  if (!family) {
    res.status(404).json({ error: "Družina ne obstaja." });
    return;
  }

  const vars = { ...def.sampleValues, ...parsed.data.vars, familyName: family.family_name };

  try {
    await sendMail({
      to: parsed.data.to,
      subject: `[TEST] ${renderTemplate(parsed.data.subject, vars)}`,
      text: renderTemplate(parsed.data.body, vars)
    });
  } catch (err) {
    res.status(502).json({
      error: err instanceof Error ? err.message : "Pošiljanje testne e-pošte ni uspelo."
    });
    return;
  }

  res.json({ sent: true, to: parsed.data.to });
});

const translateSchema = z.object({
  subject: z.string().trim().min(1, "Zadeva ne sme biti prazna.").max(300),
  body: z.string().trim().min(1, "Besedilo ne sme biti prazno.").max(20000)
});

emailTemplatesRouter.post("/:type/translate", async (req, res) => {
  const def = findDefinition(req.params.type);
  if (!def) {
    res.status(404).json({ error: "Neznana predloga e-pošte." });
    return;
  }

  const parsed = translateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Neveljaven zahtevek." });
    return;
  }

  try {
    const translated = await translateToCroatian(parsed.data);
    res.json(translated);
  } catch (err) {
    res.status(502).json({
      error: err instanceof Error ? err.message : "Prevajanje ni uspelo."
    });
  }
});
