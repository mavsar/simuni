/**
 * A price tier for a part of the year. Dates are stored as month/day so the
 * season recurs every year. Per-person nightly prices are split by age band.
 */
export type Season = {
  /** Present for persisted seasons; absent for newly added, unsaved rows. */
  id?: number;
  /** Human label, e.g. `11.07.–22.08.`. */
  name: string;
  startMonth: number;
  startDay: number;
  endMonth: number;
  endDay: number;
  /** Nightly price for an adult (12–59). */
  priceAdult: number;
  /** Nightly price for a senior adult (60+). */
  priceAdultSenior: number;
  /** Nightly price for a child aged 0–2. */
  priceChild0_2: number;
  /** Nightly price for a child aged 3–5. */
  priceChild3_5: number;
  /** Nightly price for a child aged 6–11. */
  priceChild6_11: number;
};

export type Settings = {
  /** Yearly rent (pavšal) before the one-time-payment discount. */
  pausalPrice: number;
  /** Discount in percent applied because the rent is paid in one go. */
  oneoffDiscountPercent: number;
  /** Tourist tax charged per attendee per night. */
  touristTax: number;
  /** One-time accommodation payment, charged per attendee once per reservation. */
  accommodationFee: number;
  /** Persons younger than this many whole years don't pay tourist tax. */
  touristTaxExemptAge: number;
  /** Per-person nightly price tiers across the year. */
  seasons: Season[];
};

export type EmailTemplatePlaceholder = {
  key: string;
  description: string;
};

/** An automated email's editable content, e.g. the "prices confirmed" email. */
export type EmailTemplate = {
  type: string;
  label: string;
  description: string;
  placeholders: EmailTemplatePlaceholder[];
  /** Sample values for every placeholder, used to render an admin-facing preview. */
  sampleValues: Record<string, string>;
  subject: string;
  body: string;
  /** Fixed address this template always sends to (e.g. camp reception); '' if unused. */
  recipient: string;
  /** Extra admin-configured BCC addresses, comma-separated; '' if none. */
  bcc: string;
  /** Label for the recipient field, or null if this template has no fixed recipient. */
  recipientLabel: string | null;
  /** Whether an admin has overridden the built-in default. */
  isCustomized: boolean;
  updatedAt: string | null;
};

/**
 * 'online': the family wants the automated pre-arrival notice (sent 1 week
 * before check-in) and only visits reception at checkout. 'manual': they'll
 * check in/out at reception themselves — no automated notice is sent.
 */
export type CheckinMode = 'online' | 'manual';

export type Reservation = {
  id: number;
  /** Owning family of the reservation. */
  userId: number;
  /** Inclusive first day, `YYYY-MM-DD`. */
  startDay: string;
  /** Inclusive last day, `YYYY-MM-DD`. */
  endDay: string;
  /** Family name of the owner, e.g. for other families' reservations. */
  ownerName: string;
  /** Family members attending this reservation. */
  persons: Person[];
  /** Cars brought on this reservation. */
  cars: Car[];
  /** Admin-set: whether the bungalov payment has been settled. */
  bungalovPaid: boolean;
  checkinMode: CheckinMode;
  /** Whether the automated online-reservation notice has already been sent. */
  onlineCheckinEmailSent: boolean;
  /** Total audit-trail entries for this reservation. */
  historyCount: number;
  /** Entries created since the current viewer last opened the history modal — per-account, not shared. */
  unseenHistoryCount: number;
};

/** Payload for `PATCH /reservations/:id/payment`. Admins only. */
export type ReservationPaymentInput = {
  bungalovPaid: boolean;
};

export type ReservationCreatedChanges = {
  startDay: string;
  endDay: string;
  ownerName: string;
  persons: string[];
  cars: string[];
};

export type ReservationUpdatedChanges = {
  period?: {
    from: { startDay: string; endDay: string };
    to: { startDay: string; endDay: string };
  };
  owner?: { from: string; to: string };
  persons?: { added: string[]; removed: string[] };
  cars?: { added: string[]; removed: string[] };
};

export type ReservationPaymentChanges = {
  bungalovPaid: { from: boolean; to: boolean };
};

export type ReservationEmailSentChanges = {
  /** The address the notice was sent to (the camp reception), not the family's own. */
  recipient: string;
  /** The exact rendered content that was sent — absent on entries recorded before this was tracked. */
  subject?: string;
  body?: string;
};

/** One admin-visible audit-trail entry for a reservation. */
export type ReservationHistoryEntry =
  | {
      id: number;
      action: 'created';
      changes: ReservationCreatedChanges;
      createdAt: string;
      actorName: string;
      actorRole: Role;
    }
  | {
      id: number;
      action: 'updated';
      changes: ReservationUpdatedChanges;
      createdAt: string;
      actorName: string;
      actorRole: Role;
    }
  | {
      id: number;
      action: 'payment';
      changes: ReservationPaymentChanges;
      createdAt: string;
      actorName: string;
      actorRole: Role;
    }
  | {
      id: number;
      action: 'email_sent';
      changes: ReservationEmailSentChanges;
      createdAt: string;
      actorName: string;
      actorRole: Role;
    };

export type ReservationRangeInput = {
  startDay: string;
  endDay: string;
  /** Admins only: assign the reservation to this family. */
  userId?: number;
  /** Ids of the family members attending. */
  personIds: number[];
  /** Ids of the cars coming on this reservation. */
  carIds: number[];
  checkinMode: CheckinMode;
};

export type Role = 'admin' | 'user';

/** The kind of identity document recorded for a person. */
export type IdType = 'id_card' | 'drivers_license' | 'passport';

/** A member of a family. */
export type Person = {
  id: number;
  name: string;
  /** Date of birth, `YYYY-MM-DD`, used to derive the age. */
  birthday: string;
  /** Whether this person is "na pavšalu" (flat-rate). */
  naPausalu: boolean;
  /** Type of identity document. */
  idType: IdType;
  /** Identity document number (may be empty). */
  idNumber: string;
};

export type PersonInput = {
  /** Present when editing an existing person, so the server updates them in
   * place instead of recreating them under a new id — which would silently
   * drop them from every reservation they're on. Absent for a new person. */
  id?: number;
  name: string;
  birthday: string;
  naPausalu: boolean;
  idType: IdType;
  idNumber: string;
};

/** A car belonging to a family. */
export type Car = {
  id: number;
  name: string;
  /** Registration plate number. */
  registrationPlate: string;
};

export type CarInput = {
  /** Same role as PersonInput.id — see its comment. */
  id?: number;
  name: string;
  registrationPlate: string;
};

/** The authenticated principal — a family account with its members. */
export type User = {
  id: number;
  username: string;
  familyName: string;
  role: Role;
  email: string;
  /** Admin-only, hidden flag: excluded families never see or pay the bungalov share. */
  paymentExcluded: boolean;
  persons: Person[];
  cars: Car[];
};

/** A family account with its members, as managed on the Družine page. */
export type Family = User;

export type CreateFamilyInput = {
  username: string;
  password: string;
  familyName: string;
  role: Role;
  email: string;
  paymentExcluded: boolean;
  persons: PersonInput[];
  cars: CarInput[];
};

export type UpdateFamilyInput = {
  username: string;
  /** Empty string keeps the existing password. */
  password?: string;
  familyName: string;
  role: Role;
  email: string;
  paymentExcluded: boolean;
  persons: PersonInput[];
  cars: CarInput[];
};

/** Self-service update for the current user's own family members and cars. */
export type ProfileInput = {
  persons: PersonInput[];
  cars: CarInput[];
};

/** Self-service update for the current user's own login credentials. */
export type ProfileAccountInput = {
  username: string;
  /** Empty/omitted keeps the existing password. */
  password?: string;
};

export type LoginResponse = {
  token: string;
  user: User;
};
