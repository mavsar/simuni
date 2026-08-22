import { useCallback, useMemo, useState } from 'react';

import { AppHeader, type AppHeaderTab } from '../components/AppHeader';
import { buildReservationBreakdowns, computeBungalovPricingByYear } from '../lib/pricing';
import { useAuth } from '../state/AuthContext';
import { useAppData } from '../state/useAppData';
import { AvailabilityPage } from './AvailabilityPage';
import { FamiliesPage } from './FamiliesPage';
import { MyProfilePage } from './MyProfilePage';
import { SettingsPage } from './SettingsPage';

export function HomePage() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<AppHeaderTab>('razpolozljivost');
  const {
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
    updateReservationPayment
  } = useAppData();

  // Confirming a year freezes each of its reservations' amounts as of right
  // now (see the plan's "Snapshot trust model"): later booking changes in
  // that year can then never move an already-confirmed family's bill. The
  // snapshot uses the same breakdown math AvailabilityPage displays with, so
  // what gets frozen is exactly what the family was quoted.
  const breakdownsById = useMemo(() => {
    const bungalovPricing = computeBungalovPricingByYear(settingsForYear, occupiedDays);
    return buildReservationBreakdowns(reservations, settingsForYear, bungalovPricing);
  }, [reservations, settingsForYear, occupiedDays]);

  const confirmYearPrices = useCallback(
    async (year: number) => {
      const snapshots = reservations
        .filter((r) => Number(r.startDay.slice(0, 4)) === year)
        .map((r) => {
          const breakdown = breakdownsById.get(r.id)!;
          return { reservationId: r.id, bungalov: breakdown.bungalov, simuni: breakdown.simuni };
        });
      await confirmPrices(year, snapshots);
    },
    [reservations, breakdownsById, confirmPrices]
  );

  const isAdmin = user?.role === 'admin';
  // Guard against landing on a tab the current role can't access:
  // non-admins have no Družine tab, admins have no Moj profil tab.
  const resolvedTab: AppHeaderTab =
    (activeTab === 'druzine' && !isAdmin) || (activeTab === 'profil' && isAdmin)
      ? 'razpolozljivost'
      : activeTab;

  return (
    <div className="flex h-full w-full flex-col">
      <AppHeader
        activeTab={resolvedTab}
        onTabChange={setActiveTab}
        onLogout={logout}
        isAdmin={isAdmin}
        userName={user?.familyName}
      />

      <main className="flex-1 scrollbar-gutter-stable overflow-y-auto px-4 py-6 sm:px-6">
        {resolvedTab === 'druzine' && isAdmin && user ? (
          <FamiliesPage currentUserId={user.id} />
        ) : resolvedTab === 'profil' && user ? (
          <MyProfilePage />
        ) : loading ? (
          <p className="text-center text-sm text-white/80 drop-shadow-sm">Nalagam…</p>
        ) : (
          <>
            {error && (
              <div className="mx-auto mb-4 w-full max-w-5xl rounded-xl bg-red-50 px-4 py-2 text-sm font-medium text-red-700 ring-1 ring-red-200">
                {error}
              </div>
            )}
            {resolvedTab === 'razpolozljivost' && user ? (
              <AvailabilityPage
                settingsForYear={settingsForYear}
                reservations={reservations}
                occupiedDays={occupiedDays}
                currentUserId={user.id}
                isAdmin={isAdmin}
                onCreateReservation={createReservation}
                onUpdateReservation={updateReservation}
                onDeleteReservation={deleteReservation}
                onUpdateReservationPayment={updateReservationPayment}
              />
            ) : (
              <SettingsPage
                years={settingsYears}
                onSave={saveSettings}
                onConfirm={confirmYearPrices}
                onUnlock={unlockPrices}
                isAdmin={isAdmin}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
