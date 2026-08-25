import { cx } from 'class-variance-authority';
import {
  CalendarCheck,
  ChevronDown,
  Home,
  LogOut,
  Mail,
  Menu,
  ReceiptEuro,
  Settings,
  UserRound,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState, type ComponentType, type SVGProps } from 'react';

import { SimuniLogo } from './SimuniLogo';
import { Button } from './ui/Button';
import { Tab, Tabs, tabVariants } from './ui/Tabs';

export type AppHeaderTab = 'razpolozljivost' | 'nastavitve' | 'druzine' | 'profil';
export type SettingsSection = 'cene' | 'emaili';

export type AppHeaderProps = {
  title?: string;
  activeTab: AppHeaderTab;
  onTabChange: (tab: AppHeaderTab) => void;
  onLogout?: () => void;
  isAdmin?: boolean;
  userName?: string;
  /** Which "Nastavitve" subpage is active. Only meaningful for admins. */
  settingsSection?: SettingsSection;
  onSettingsSectionChange?: (section: SettingsSection) => void;
};

type NavItem = {
  value: AppHeaderTab;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>;
};

const SETTINGS_SECTIONS: Array<{
  value: SettingsSection;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>;
}> = [
  { value: 'cene', label: 'Cene', Icon: ReceiptEuro },
  { value: 'emaili', label: 'Emaili', Icon: Mail },
];

type NastavitveDropdownProps = {
  active: boolean;
  section: SettingsSection;
  onSelect: (section: SettingsSection) => void;
};

/** Desktop-only "Nastavitve" nav item: opens a popover with its two subpages. */
function NastavitveDropdown({ active, section, onSelect }: NastavitveDropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        role="tab"
        aria-haspopup="menu"
        aria-expanded={open}
        data-active={active}
        onClick={() => setOpen((prev) => !prev)}
        className={tabVariants({ variant: 'underline', size: 'md' })}
      >
        <Settings size={18} className="shrink-0" aria-hidden />
        Nastavitve
        <ChevronDown
          size={14}
          className={cx('shrink-0 transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-44 rounded-xl border border-brand/15 bg-white p-1 shadow-lg ring-1 ring-brand/5">
          {SETTINGS_SECTIONS.map(({ value, label, Icon }) => {
            const isSelected = active && section === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => {
                  onSelect(value);
                  setOpen(false);
                }}
                className={cx(
                  'flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm transition-colors',
                  isSelected ? 'bg-brand text-white' : 'text-brand-dark hover:bg-sky',
                )}
              >
                <Icon size={16} className="shrink-0" aria-hidden />
                {label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function AppHeader({
  title = 'Šimuni Bungalov 41',
  activeTab,
  onTabChange,
  onLogout,
  isAdmin = false,
  userName,
  settingsSection = 'cene',
  onSettingsSectionChange,
}: AppHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  // Lock body scroll while menu is open
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  // Close on Escape
  useEffect(() => {
    if (!menuOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [menuOpen]);

  const navItems: NavItem[] = [
    { value: 'razpolozljivost', label: 'Razpoložljivost', Icon: CalendarCheck },
    {
      value: 'nastavitve',
      label: isAdmin ? 'Nastavitve' : 'Cenik',
      Icon: isAdmin ? Settings : ReceiptEuro,
    },
    ...(isAdmin
      ? [{ value: 'druzine' as AppHeaderTab, label: 'Družine', Icon: Home }]
      : [{ value: 'profil' as AppHeaderTab, label: 'Moj profil', Icon: UserRound }]),
  ];

  function handleTabSelect(tab: AppHeaderTab) {
    onTabChange(tab);
    setMenuOpen(false);
  }

  function handleLogout() {
    setMenuOpen(false);
    onLogout?.();
  }

  return (
    <>
      {/* Header bar — always on top (z-50) so it floats above the full-screen overlay */}
      <header className="relative z-50 w-full border-b border-white">
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

          {/* Tabs — desktop only */}
          <div className="hidden flex-1 items-center justify-center px-4 lg:flex">
            <Tabs
              variant="underline"
              value={activeTab}
              onValueChange={(value) => onTabChange(value as AppHeaderTab)}
              aria-label="Glavna navigacija"
            >
              {navItems.map(({ value, label, Icon }) =>
                value === 'nastavitve' && isAdmin ? (
                  <NastavitveDropdown
                    key={value}
                    active={activeTab === 'nastavitve'}
                    section={settingsSection}
                    onSelect={(section) => onSettingsSectionChange?.(section)}
                  />
                ) : (
                  <Tab key={value} value={value} icon={Icon}>
                    {label}
                  </Tab>
                ),
              )}
            </Tabs>
          </div>

          {/* Spacer on mobile */}
          <div className="flex-1 lg:hidden" />

          {/* Logged-in user — desktop only */}
          {userName && (
            <div className="hidden items-center border-l border-white px-4 lg:flex">
              <span className="text-sm font-medium text-white/90 drop-shadow-sm">{userName}</span>
            </div>
          )}

          {/* Logout — desktop only */}
          <Button
            onClick={onLogout}
            aria-label="Odjava"
            title="Odjava"
            className="group relative hidden aspect-square h-full overflow-hidden rounded-none border-l border-white px-0 py-0 shadow-none duration-300 hover:bg-brand hover:text-brand focus-visible:ring-inset focus-visible:ring-white/60 lg:flex"
          >
            <span
              aria-hidden
              className="absolute inset-0 -translate-x-full bg-white transition-all duration-300 ease-[cubic-bezier(0.39,0.575,0.565,1)] [clip-path:polygon(15%_0%,100%_0%,85%_100%,0%_100%)] group-hover:translate-x-0 group-hover:[clip-path:polygon(0%_0%,100%_0%,100%_100%,0%_100%)]"
            />
            <LogOut size={20} className="relative z-10 shrink-0" aria-hidden />
          </Button>

          {/* Hamburger / close toggle — mobile/tablet only */}
          <button
            type="button"
            aria-label={menuOpen ? 'Zapri meni' : 'Odpri meni'}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            onClick={() => setMenuOpen((prev) => !prev)}
            className="flex aspect-square h-full items-center justify-center border-l border-white text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/60 lg:hidden"
          >
            {menuOpen ? <X size={22} aria-hidden /> : <Menu size={22} aria-hidden />}
          </button>
        </div>
      </header>

      {/* Full-screen mobile/tablet overlay */}
      {menuOpen && (
        <div
          id="mobile-nav"
          className="fixed inset-0 z-40 flex flex-col backdrop-blur-md lg:hidden"
          style={{ background: 'rgba(10, 30, 60, 0.92)' }}
        >
          {/* Spacer equal to header height */}
          <div className="h-16 flex-shrink-0 border-b border-white/10" />

          {/* Nav items — vertically centered in remaining space */}
          <nav
            aria-label="Mobilna navigacija"
            className="flex flex-1 flex-col items-center justify-center gap-3 px-8"
          >
            {navItems.flatMap(({ value, label, Icon }) => {
              if (value === 'nastavitve' && isAdmin) {
                return SETTINGS_SECTIONS.map((option) => {
                  const isActive = activeTab === 'nastavitve' && settingsSection === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        onSettingsSectionChange?.(option.value);
                        setMenuOpen(false);
                      }}
                      className={`group flex w-full max-w-xs items-center gap-4 rounded-2xl px-6 py-4 text-lg font-semibold transition-all duration-200 ${
                        isActive
                          ? 'bg-white/15 text-white ring-1 ring-white/20'
                          : 'text-white/60 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <option.Icon
                        size={22}
                        className={`shrink-0 transition-colors ${isActive ? 'text-white' : 'text-white/50 group-hover:text-white'}`}
                        aria-hidden
                      />
                      {option.label}
                      {isActive && (
                        <span className="ml-auto h-2 w-2 rounded-full bg-white" aria-hidden />
                      )}
                    </button>
                  );
                });
              }

              const isActive = activeTab === value;
              return [
                <button
                  key={value}
                  type="button"
                  onClick={() => handleTabSelect(value)}
                  className={`group flex w-full max-w-xs items-center gap-4 rounded-2xl px-6 py-4 text-lg font-semibold transition-all duration-200 ${
                    isActive
                      ? 'bg-white/15 text-white ring-1 ring-white/20'
                      : 'text-white/60 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Icon
                    size={22}
                    className={`shrink-0 transition-colors ${isActive ? 'text-white' : 'text-white/50 group-hover:text-white'}`}
                    aria-hidden
                  />
                  {label}
                  {isActive && (
                    <span className="ml-auto h-2 w-2 rounded-full bg-white" aria-hidden />
                  )}
                </button>,
              ];
            })}
          </nav>

          {/* Bottom: username + logout */}
          <div className="flex-shrink-0 border-t border-white/10 px-8 py-6">
            {userName && (
              <p className="mb-4 text-center text-xs font-medium uppercase tracking-widest text-white/40">
                {userName}
              </p>
            )}
            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center justify-center gap-3 rounded-2xl border border-white/15 px-6 py-3.5 text-base font-medium text-white/70 transition-all hover:border-white/30 hover:bg-white/10 hover:text-white"
            >
              <LogOut size={18} aria-hidden />
              Odjava
            </button>
          </div>
        </div>
      )}
    </>
  );
}
