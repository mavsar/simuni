import { useCallback, useMemo } from 'react';
import { useLocation, useMatch, useNavigate } from 'react-router-dom';

import { AppHeader, type AppHeaderTab, type SettingsSection } from '../components/AppHeader';
import { buildReservationBreakdowns, computeBungalovPricingByYear } from '../lib/pricing';
import { useAuth } from '../state/AuthContext';
import { useAppData } from '../state/useAppData';
import { AvailabilityPage } from './AvailabilityPage';
import { EmailSettingsPage } from './EmailSettingsPage';
import { FamiliesPage } from './FamiliesPage';
import { MyProfilePage } from './MyProfilePage';
import { SettingsPage } from './SettingsPage';

export function HomePage() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  // The first path segment IS the tab: App.tsx only ever routes here for a
  // valid, role-appropriate tab, so it can be trusted as-is. A tab's own
  // sub-pages (e.g. /razpolozljivost/nova-rezervacija) live under it and are
  // read directly by that tab's page component.
  const activeTab = location.pathname.split('/')[1] as AppHeaderTab;
  // "Nastavitve" has two subpages (Cene/Emaili), chosen by a header dropdown
  // rather than in-page tabs — same sub-route precedent as above, just read
  // here instead of inside the page component since it picks between two
  // whole page components.
  const emailsMatch = useMatch('/nastavitve/emaili');
  const settingsSection: SettingsSection = emailsMatch ? 'emaili' : 'cene';
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
    updateReservationPayment,
    refreshReservations
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
      return confirmPrices(year, snapshots);
    },
    [reservations, breakdownsById, confirmPrices]
  );

  const isAdmin = user?.role === 'admin';
  const hideBungalov = !isAdmin && !!user?.paymentExcluded;

  function handleTabChange(tab: AppHeaderTab) {
    navigate(`/${tab}`);
  }

  function handleSettingsSectionChange(section: SettingsSection) {
    navigate(`/nastavitve/${section}`);
  }

  return (
    <div className="flex h-full w-full flex-col">
      <AppHeader
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onLogout={logout}
        isAdmin={isAdmin}
        userName={user?.familyName}
        settingsSection={settingsSection}
        onSettingsSectionChange={isAdmin ? handleSettingsSectionChange : undefined}
      />

      <main className="flex-1 scrollbar-gutter-stable overflow-y-auto px-4 py-6 sm:px-6">
        {activeTab === 'druzine' && isAdmin && user ? (
          <FamiliesPage currentUserId={user.id} />
        ) : activeTab === 'profil' && user ? (
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
            {activeTab === 'razpolozljivost' && user ? (
              <AvailabilityPage
                settingsForYear={settingsForYear}
                reservations={reservations}
                occupiedDays={occupiedDays}
                currentUserId={user.id}
                isAdmin={isAdmin}
                hideBungalov={hideBungalov}
                onCreateReservation={createReservation}
                onUpdateReservation={updateReservation}
                onDeleteReservation={deleteReservation}
                onUpdateReservationPayment={updateReservationPayment}
                onRefreshReservations={refreshReservations}
              />
            ) : settingsSection === 'emaili' && isAdmin ? (
              <EmailSettingsPage reservations={reservations} breakdownsById={breakdownsById} />
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
