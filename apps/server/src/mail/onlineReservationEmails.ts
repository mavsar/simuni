import { sqlite } from "../db/client.js";
import { recordReservationHistory } from "../db/reservationHistory.js";
import { getEffectiveTemplate } from "./emailTemplateStore.js";
import { sendMail } from "./mailer.js";
import { EMAIL_TEMPLATE_DEFINITIONS, renderTemplate } from "./templates.js";

const ONLINE_RESERVATION_TEMPLATE = EMAIL_TEMPLATE_DEFINITIONS.find(
  (def) => def.type === "online_reservation"
)!;

type DueReservationRow = {
  id: number;
  start_day: string;
  end_day: string;
  family_name: string;
  email: string;
};

type PersonRow = {
  name: string;
  birthday: string;
  na_pausalu: number;
  id_type: string;
  id_number: string;
};

type CarRow = {
  registration_plate: string;
};

const selectDueReservations = sqlite.prepare(`
  SELECT r.id, r.start_day, r.end_day, u.family_name, u.email
  FROM reservations r
  JOIN users u ON u.id = r.user_id
  WHERE r.checkin_mode = 'online'
    AND r.start_day BETWEEN date('now') AND date('now', '+7 days')
    AND r.id NOT IN (SELECT reservation_id FROM reservation_reminders)
`);

const selectPersonsForReservation = sqlite.prepare(`
  SELECT p.name, p.birthday, p.na_pausalu, p.id_type, p.id_number
  FROM reservation_persons rp
  JOIN persons p ON p.id = rp.person_id
  WHERE rp.reservation_id = ?
  ORDER BY p.id
`);

const selectCarsForReservation = sqlite.prepare(`
  SELECT c.registration_plate
  FROM reservation_cars rc
  JOIN cars c ON c.id = rc.car_id
  WHERE rc.reservation_id = ?
  ORDER BY c.id
`);

const markSent = sqlite.prepare(
  `INSERT OR IGNORE INTO reservation_reminders (reservation_id) VALUES (?)`
);

// Automated sends have no acting user — attributed to the primary admin so
// the history entry has a real, valid actor (reservation_history.user_id is
// a required FK) rather than needing a schema change for a "system" actor.
const selectFirstAdmin = sqlite.prepare(
  `SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1`
);

// This block always renders in Croatian, regardless of which language the
// surrounding template prose is in — it's data addressed to the (Croatian)
// camp reception, not admin-editable text, so it never goes through the
// translate button.
const ID_TYPE_LABEL: Record<string, string> = {
  id_card: "osobna iskaznica",
  drivers_license: "vozačka dozvola",
  passport: "putovnica"
};

/** `YYYY-MM-DD` → `D. M. YYYY`. */
function formatDay(dayKey: string): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  return `${day}. ${month}. ${year}`;
}

/** `Ime Priimek / osobna iskaznica: 123 / rođ. D. M. YYYY / na paušalu` — the
 * ID segment is omitted when no number is on file, "na paušalu" only when true. */
function formatPersonsBlock(persons: PersonRow[]): string {
  if (persons.length === 0) return "/";
  return persons
    .map((person) => {
      const segments = [person.name];
      if (person.id_number) {
        const idLabel = ID_TYPE_LABEL[person.id_type] ?? person.id_type;
        segments.push(`${idLabel}: ${person.id_number}`);
      }
      segments.push(`rođ. ${formatDay(person.birthday)}`);
      if (person.na_pausalu === 1) segments.push("na paušalu");
      return `- ${segments.join(" / ")}`;
    })
    .join("\n");
}

function formatCarsBlock(cars: CarRow[]): string {
  if (cars.length === 0) return "/";
  return cars.map((car) => car.registration_plate).join(", ");
}

/** Comma-separated address list → trimmed, non-empty addresses. */
function parseBccList(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * Sends the "online reservation" notice to the configured reception address
 * (BCCing the family) for every reservation starting within the next 7 days
 * that hasn't been sent yet. Run daily plus once at boot (see index.ts) —
 * the day-range check rather than an exact-day match means a missed run
 * (downtime, a transient Gmail failure) is caught up on the next pass
 * instead of silently never sending. A reservation is marked sent only
 * after `sendMail` actually succeeds, so a failure gets retried tomorrow.
 */
export async function sendDueOnlineReservationEmails(): Promise<void> {
  const due = selectDueReservations.all() as DueReservationRow[];
  if (due.length === 0) return;

  const template = getEffectiveTemplate(ONLINE_RESERVATION_TEMPLATE);
  if (!template.recipient) {
    console.warn(
      `[online-reservation-emails] ${due.length} reservation(s) due but no recipient configured — set it on the "Online rezervacija" template in Nastavitve → Emaili.`
    );
    return;
  }

  const admin = selectFirstAdmin.get() as { id: number } | undefined;

  for (const reservation of due) {
    const persons = selectPersonsForReservation.all(reservation.id) as PersonRow[];
    const cars = selectCarsForReservation.all(reservation.id) as CarRow[];

    const vars = {
      familyName: reservation.family_name,
      startDay: formatDay(reservation.start_day),
      endDay: formatDay(reservation.end_day),
      persons: formatPersonsBlock(persons),
      cars: formatCarsBlock(cars)
    };

    const renderedSubject = renderTemplate(template.subject, vars);
    const renderedBody = renderTemplate(template.body, vars);

    const bcc = [...parseBccList(template.bcc), reservation.email].filter(Boolean);

    try {
      await sendMail({
        to: template.recipient,
        bcc: bcc.length > 0 ? bcc : undefined,
        subject: renderedSubject,
        text: renderedBody
      });
      markSent.run(reservation.id);
      if (admin) {
        // Stores the exact rendered content, not just a reference to the
        // template — so "Show email" in the history modal always reflects
        // what was actually sent, even if the template is edited afterward.
        recordReservationHistory(reservation.id, admin.id, "email_sent", {
          recipient: template.recipient,
          subject: renderedSubject,
          body: renderedBody
        });
      }
    } catch (err) {
      console.error(
        `[online-reservation-emails] failed to send for reservation ${reservation.id}:`,
        err
      );
    }
  }
}
