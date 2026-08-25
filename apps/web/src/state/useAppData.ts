import { useCallback, useEffect, useMemo, useState } from 'react';

import { api, type EmailReport } from '../lib/api';
import { eachNightKeyInRange } from '../lib/dates';
import {
  buildYearSettingsLookup,
  type YearSettings,
  type YearSettingsLookup
} from '../lib/pricing';
import type { Reservation, ReservationRangeInput, Settings } from '../lib/types';

export type AppData = {
  /** Pricing settings for every configurable year, ascending. */
  settingsYears: YearSettings[];
  /** Settings for a year; never misses — inherits from a neighbouring year. */
  settingsForYear: YearSettingsLookup;
  reservations: Reservation[];
  /** Union of all reserved nights (by start date) across every reservation. */
  occupiedDays: Set<string>;
  loading: boolean;
  error: string | null;
  saveSettings: (year: number, next: Settings) => Promise<void>;
  confirmPrices: (
    year: number,
    snapshots: Array<{ reservationId: number; bungalov: number; simuni: number }>
  ) => Promise<EmailReport>;
  unlockPrices: (year: number) => Promise<void>;
  createReservation: (input: ReservationRangeInput) => Promise<void>;
  updateReservation: (id: number, input: ReservationRangeInput) => Promise<void>;
  deleteReservation: (id: number) => Promise<void>;
  updateReservationPayment: (id: number, bungalovPaid: boolean) => Promise<void>;
  /** Refetches reservations — e.g. after viewing a reservation's history clears its unseen badge server-side. */
  refreshReservations: () => Promise<void>;
};

export function useAppData(): AppData {
  const [settingsYears, setSettingsYears] = useState<YearSettings[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [settingsResponse, reservationsResponse] = await Promise.all([
          api.getSettings(),
          api.getReservations()
        ]);
        if (cancelled) return;
        setSettingsYears(settingsResponse.years);
        setReservations(reservationsResponse.reservations);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Napaka pri nalaganju podatkov.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const settingsForYear = useMemo(() => buildYearSettingsLookup(settingsYears), [settingsYears]);

  const occupiedDays = useMemo(() => {
    const days = new Set<string>();
    for (const reservation of reservations) {
      for (const day of eachNightKeyInRange(reservation.startDay, reservation.endDay)) {
        days.add(day);
      }
    }
    return days;
  }, [reservations]);

  const saveSettings = useCallback(async (year: number, next: Settings) => {
    setError(null);
    const { years } = await api.updateSettings(year, next);
    setSettingsYears(years);
  }, []);

  const confirmPrices = useCallback(
    async (
      year: number,
      snapshots: Array<{ reservationId: number; bungalov: number; simuni: number }>
    ) => {
      setError(null);
      const { years, emailReport } = await api.confirmPrices(year, { snapshots });
      setSettingsYears(years);
      return emailReport;
    },
    []
  );

  const unlockPrices = useCallback(async (year: number) => {
    setError(null);
    const { years } = await api.unlockPrices(year);
    setSettingsYears(years);
  }, []);

  const createReservation = useCallback(async (input: ReservationRangeInput) => {
    const { reservations: next } = await api.createReservation(input);
    setReservations(next);
  }, []);

  const updateReservation = useCallback(async (id: number, input: ReservationRangeInput) => {
    const { reservations: next } = await api.updateReservation(id, input);
    setReservations(next);
  }, []);

  const deleteReservation = useCallback(async (id: number) => {
    const { reservations: next } = await api.deleteReservation(id);
    setReservations(next);
  }, []);

  const updateReservationPayment = useCallback(async (id: number, bungalovPaid: boolean) => {
    const { reservations: next } = await api.updateReservationPayment(id, { bungalovPaid });
    setReservations(next);
  }, []);

  const refreshReservations = useCallback(async () => {
    const { reservations: next } = await api.getReservations();
    setReservations(next);
  }, []);

  return useMemo(
    () => ({
      settingsYears,
      settingsForYear,
      reservations,
      occupiedDays,
      loading,
      error,
      saveSettings,
      confirmPrices,
      unlockPrices,
      createReservation,
      updateReservation,
      deleteReservation,
      updateReservationPayment,
      refreshReservations
    }),
    [
      settingsYears,
      settingsForYear,
      reservations,
      occupiedDays,
      loading,
      error,
      saveSettings,
      confirmPrices,
      unlockPrices,
      createReservation,
      updateReservation,
      deleteReservation,
      updateReservationPayment,
      refreshReservations
    ]
  );
}
