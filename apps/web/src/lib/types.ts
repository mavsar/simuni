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
  /** Per-person nightly price tiers across the year. */
  seasons: Season[];
};

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
  name: string;
  registrationPlate: string;
};

/** The authenticated principal — a family account with its members. */
export type User = {
  id: number;
  username: string;
  familyName: string;
  role: Role;
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
  persons: PersonInput[];
  cars: CarInput[];
};

export type UpdateFamilyInput = {
  username: string;
  /** Empty string keeps the existing password. */
  password?: string;
  familyName: string;
  role: Role;
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
