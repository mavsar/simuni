import { useCallback, useEffect, useMemo, useState } from 'react';

import { api } from '../lib/api';
import { eachNightKeyInRange } from '../lib/dates';
import type { Reservation, ReservationRangeInput, Settings } from '../lib/types';

export type AppData = {
  settings: Settings;
  reservations: Reservation[];
  /** Union of all reserved nights (by start date) across every reservation. */
  occupiedDays: Set<string>;
  loading: boolean;
  error: string | null;
  saveSettings: (next: Settings) => Promise<void>;
  createReservation: (input: ReservationRangeInput) => Promise<void>;
  updateReservation: (id: number, input: ReservationRangeInput) => Promise<void>;
  deleteReservation: (id: number) => Promise<void>;
};

export function useAppData(): AppData {
  const [settings, setSettings] = useState<Settings>({
    pausalPrice: 0,
    oneoffDiscountPercent: 0,
    touristTax: 0,
    accommodationFee: 0,
    touristTaxExemptAge: 0,
    seasons: []
  });
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [loadedSettings, reservationsResponse] = await Promise.all([
          api.getSettings(),
          api.getReservations()
        ]);
        if (cancelled) return;
        setSettings(loadedSettings);
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

  const occupiedDays = useMemo(() => {
    const days = new Set<string>();
    for (const reservation of reservations) {
      for (const day of eachNightKeyInRange(reservation.startDay, reservation.endDay)) {
        days.add(day);
      }
    }
    return days;
  }, [reservations]);

  const saveSettings = useCallback(async (next: Settings) => {
    setError(null);
    const saved = await api.updateSettings(next);
    setSettings(saved);
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

  return useMemo(
    () => ({
      settings,
      reservations,
      occupiedDays,
      loading,
      error,
      saveSettings,
      createReservation,
      updateReservation,
      deleteReservation
    }),
    [
      settings,
      reservations,
      occupiedDays,
      loading,
      error,
      saveSettings,
      createReservation,
      updateReservation,
      deleteReservation
    ]
  );
}
