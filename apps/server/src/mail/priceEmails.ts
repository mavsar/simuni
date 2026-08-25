import { sqlite } from "../db/client.js";
import { getEffectiveTemplate } from "./emailTemplateStore.js";
import { sendMail } from "./mailer.js";
import { EMAIL_TEMPLATE_DEFINITIONS, renderTemplate } from "./templates.js";

const PRICE_CONFIRMATION_TEMPLATE = EMAIL_TEMPLATE_DEFINITIONS.find(
  (def) => def.type === "price_confirmation"
)!;

export type PriceSnapshot = {
  reservationId: number;
  bungalov: number;
  simuni: number;
};

export type EmailReport = {
  sent: string[];
  skippedNoEmail: string[];
  failed: string[];
};

type ReservationOwnerRow = {
  id: number;
  start_day: string;
  end_day: string;
  user_id: number;
  family_name: string;
  email: string;
  payment_excluded: number;
};

const eurFormatter = new Intl.NumberFormat("sl-SI", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2
});

function formatEur(amount: number): string {
  return eurFormatter.format(Number.isFinite(amount) ? amount : 0);
}

/** `YYYY-MM-DD` → `D. M. YYYY`. */
function formatDay(dayKey: string): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  return `${day}. ${month}. ${year}`;
}

function formatDayRange(startDay: string, endDay: string): string {
  return `${formatDay(startDay)} – ${formatDay(endDay)}`;
}

/**
 * Mails every non-excluded family its itemized bill for a year's confirmed
 * reservations, one email per family covering all their reservations that
 * year. A mail failure (missing Gmail credentials, SMTP error) never throws
 * — it is recorded in the report instead, since a year's prices must stay
 * confirmed regardless of whether the notification went out.
 */
export async function sendPriceConfirmationEmails(
  year: number,
  snapshots: PriceSnapshot[]
): Promise<EmailReport> {
  const report: EmailReport = { sent: [], skippedNoEmail: [], failed: [] };
  if (snapshots.length === 0) return report;

  const placeholders = snapshots.map(() => "?").join(", ");
  const owners = sqlite
    .prepare(
      `SELECT r.id, r.start_day, r.end_day, r.user_id, u.family_name, u.email, u.payment_excluded
       FROM reservations r
       JOIN users u ON u.id = r.user_id
       WHERE r.id IN (${placeholders})`
    )
    .all(...snapshots.map((s) => s.reservationId)) as ReservationOwnerRow[];

  const ownerById = new Map(owners.map((row) => [row.id, row]));

  type FamilyBill = {
    familyName: string;
    email: string;
    paymentExcluded: boolean;
    lines: Array<{ period: string; bungalov: number; simuni: number; total: number }>;
    totalSimuni: number;
    totalBungalov: number;
    totalAmount: number;
  };
  const byUser = new Map<number, FamilyBill>();

  for (const snapshot of snapshots) {
    const owner = ownerById.get(snapshot.reservationId);
    if (!owner) continue;

    let bill = byUser.get(owner.user_id);
    if (!bill) {
      bill = {
        familyName: owner.family_name,
        email: owner.email,
        paymentExcluded: owner.payment_excluded === 1,
        lines: [],
        totalSimuni: 0,
        totalBungalov: 0,
        totalAmount: 0
      };
      byUser.set(owner.user_id, bill);
    }

    const total = snapshot.bungalov + snapshot.simuni;
    bill.lines.push({
      period: formatDayRange(owner.start_day, owner.end_day),
      bungalov: snapshot.bungalov,
      simuni: snapshot.simuni,
      total
    });
    bill.totalSimuni += snapshot.simuni;
    bill.totalBungalov += snapshot.bungalov;
    bill.totalAmount += total;
  }

  const template = getEffectiveTemplate(PRICE_CONFIRMATION_TEMPLATE);

  for (const bill of byUser.values()) {
    if (bill.paymentExcluded) continue;
    if (!bill.email) {
      report.skippedNoEmail.push(bill.familyName);
      continue;
    }

    const lines = bill.lines
      .map(
        (line) =>
          `${line.period}\n  Za plačati Šimuni: ${formatEur(line.simuni)}\n  Za plačati bungalov: ${formatEur(
            line.bungalov
          )}\n  Skupaj: ${formatEur(line.total)}`
      )
      .join("\n\n");

    const vars = {
      familyName: bill.familyName,
      year: String(year),
      lines,
      totalSimuni: formatEur(bill.totalSimuni),
      totalBungalov: formatEur(bill.totalBungalov),
      totalAmount: formatEur(bill.totalAmount)
    };

    try {
      await sendMail({
        to: bill.email,
        subject: renderTemplate(template.subject, vars),
        text: renderTemplate(template.body, vars)
      });
      report.sent.push(bill.familyName);
    } catch {
      report.failed.push(bill.familyName);
    }
  }

  return report;
}
