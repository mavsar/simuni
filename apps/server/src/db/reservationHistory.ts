import { sqlite } from "./client.js";

const insertHistory = sqlite.prepare(
  `INSERT INTO reservation_history (reservation_id, user_id, action, changes)
   VALUES (@reservationId, @userId, @action, @changes)`
);

/**
 * Appends one admin-visible audit-trail entry for a reservation. Shared by
 * the reservations route (user-triggered edits) and the mail layer
 * (system-triggered sends), so both write to the same table the same way.
 */
export function recordReservationHistory(
  reservationId: number,
  userId: number,
  action: string,
  changes: Record<string, unknown>
): void {
  insertHistory.run({ reservationId, userId, action, changes: JSON.stringify(changes) });
}
