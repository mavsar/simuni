import { CalendarCheck, Home, LogOut, ReceiptEuro, Settings, UserRound } from 'lucide-react';

import { SimuniLogo } from './SimuniLogo';
import { Button } from './ui/Button';
import { Tab, Tabs } from './ui/Tabs';

export type AppHeaderTab = 'razpolozljivost' | 'nastavitve' | 'druzine' | 'profil';

export type AppHeaderProps = {
  title?: string;
  activeTab: AppHeaderTab;
  onTabChange: (tab: AppHeaderTab) => void;
  onLogout?: () => void;
  isAdmin?: boolean;
  userName?: string;
};

export function AppHeader({
  title = 'Šimuni Bungalov 41',
  activeTab,
  onTabChange,
  onLogout,
  isAdmin = false,
  userName,
}: AppHeaderProps) {
  return (
    <header className="w-full border-b border-white">
      <div className="flex h-16 w-full items-stretch">
        {/* Logo */}
        <div className="flex items-center border-r border-white px-5 sm:px-6">
          <SimuniLogo className="h-7 w-auto text-white drop-shadow-sm" />
        </div>

        {/* Title */}
        <div className="flex items-center px-5">
          <h1 className="text-base font-semibold tracking-tight text-white drop-shadow-sm sm:text-lg">
            {title}
          </h1>
        </div>

        {/* Tabs */}
        <div className="flex flex-1 items-center justify-center px-4">
          <Tabs
            variant="underline"
            value={activeTab}
            onValueChange={(value) => onTabChange(value as AppHeaderTab)}
            aria-label="Glavna navigacija"
          >
            <Tab value="razpolozljivost" icon={CalendarCheck}>
              Razpoložljivost
            </Tab>
            <Tab value="nastavitve" icon={isAdmin ? Settings : ReceiptEuro}>
              {isAdmin ? 'Nastavitve' : 'Cenik'}
            </Tab>
            {isAdmin && (
              <Tab value="druzine" icon={Home}>
                Družine
              </Tab>
            )}
            {!isAdmin && (
              <Tab value="profil" icon={UserRound}>
                Moj profil
              </Tab>
            )}
          </Tabs>
        </div>

        {/* Logged-in user */}
        {userName && (
          <div className="hidden items-center border-l border-white px-4 sm:flex">
            <span className="text-sm font-medium text-white/90 drop-shadow-sm">{userName}</span>
          </div>
        )}

        {/* Logout — square icon button with camping-simuni "Rezerviraj" wipe hover */}
        <Button
          onClick={onLogout}
          aria-label="Odjava"
          title="Odjava"
          className="group relative aspect-square h-full overflow-hidden rounded-none border-l border-white px-0 py-0 shadow-none duration-300 hover:bg-brand hover:text-brand focus-visible:ring-inset focus-visible:ring-white/60"
        >
          <span
            aria-hidden
            className="absolute inset-0 -translate-x-full bg-white transition-all duration-300 ease-[cubic-bezier(0.39,0.575,0.565,1)] [clip-path:polygon(15%_0%,100%_0%,85%_100%,0%_100%)] group-hover:translate-x-0 group-hover:[clip-path:polygon(0%_0%,100%_0%,100%_100%,0%_100%)]"
          />
          <LogOut size={20} className="relative z-10 shrink-0" aria-hidden />
        </Button>
      </div>
    </header>
  );
}
