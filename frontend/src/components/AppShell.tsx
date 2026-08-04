import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth, type UserRole } from '../context/AuthContext';
import RestaurantSwitcher from './RestaurantSwitcher';

// Coquille partagée (barre latérale + topbar) — Phase 8.2, dérivée de
// l'identité "Service du soir" validée point par point dans l'artefact
// de comparaison (voir FoodCFO_PLAN.md, Phase 8.1) avant tout code réel.
// Les 7 rubriques et leur restriction de rôle reprennent exactement les
// gardes déjà en place dans App.tsx (GerantRoute / RequireRole) : la
// barre ne doit jamais proposer un lien vers une page que le rôle
// courant ne peut pas ouvrir.

interface NavItem {
  path: string;
  label: string;
  roles?: UserRole[];
  icon: ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  {
    path: '/',
    label: 'Tableau de bord',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
  {
    path: '/menu',
    label: 'Carte & Marges',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <path d="M4 19V5a2 2 0 012-2h9l5 5v11a2 2 0 01-2 2H6a2 2 0 01-2-2z" />
        <path d="M14 3v5h5" />
        <path d="M9 13h6M9 17h6" />
      </svg>
    ),
  },
  {
    path: '/suppliers',
    label: 'Fournisseurs',
    roles: ['GERANT', 'CUISINE'],
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <path d="M3 7l2-4h14l2 4M3 7v12a2 2 0 002 2h14a2 2 0 002-2V7M3 7h18" />
        <path d="M9 11a3 3 0 006 0" />
      </svg>
    ),
  },
  {
    path: '/invoices',
    label: 'Factures',
    roles: ['GERANT', 'CUISINE'],
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <path d="M6 2h9l5 5v13a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2z" />
        <path d="M9 13h6M9 17h4" />
      </svg>
    ),
  },
  {
    path: '/planning',
    label: 'Planning',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <path d="M3 9h18M8 2v4M16 2v4" />
      </svg>
    ),
  },
  {
    path: '/hygiene',
    label: 'Hygiène',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <path d="M9 3v7a3 3 0 006 0V3M9 3h6M6 21l6-9 6 9" />
      </svg>
    ),
  },
  {
    path: '/control',
    label: 'Contrôle',
    roles: ['GERANT'],
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z" />
      </svg>
    ),
  },
];

// Routes réelles sans rubrique propre dans la barre — rattachées à une
// rubrique existante plutôt qu'ajoutées une par une (décision du
// 03/08/2026, voir Phase 8.2 du plan). Comptes/équipe/facturation
// vivent derrière le menu du compte, pas ici.
const RELATED_ROUTES: { prefix: string; navPath: string | null; label: string }[] = [
  { prefix: '/waste', navPath: '/menu', label: 'Carte & Marges' },
  { prefix: '/alerts', navPath: '/menu', label: 'Carte & Marges' },
  { prefix: '/orders', navPath: '/suppliers', label: 'Fournisseurs' },
  { prefix: '/reports', navPath: '/', label: 'Tableau de bord' },
  { prefix: '/consolidated', navPath: '/', label: 'Tableau de bord' },
  { prefix: '/account', navPath: null, label: 'Compte' },
  { prefix: '/team', navPath: null, label: 'Équipe' },
  { prefix: '/billing', navPath: null, label: 'Facturation' },
  { prefix: '/restaurant-settings', navPath: null, label: 'Paramètres du restaurant' },
  { prefix: '/pos', navPath: null, label: 'Caisse enregistreuse' },
];

function resolveRoute(pathname: string): { navPath: string | null; label: string } {
  if (pathname === '/') return { navPath: '/', label: 'Tableau de bord' };
  for (const item of NAV_ITEMS) {
    if (item.path !== '/' && (pathname === item.path || pathname.startsWith(item.path + '/'))) {
      return { navPath: item.path, label: item.label };
    }
  }
  for (const route of RELATED_ROUTES) {
    if (pathname === route.prefix || pathname.startsWith(route.prefix + '/')) {
      return { navPath: route.navPath, label: route.label };
    }
  }
  return { navPath: null, label: 'FoodCFO' };
}

const ROLE_LABELS: Record<UserRole, string> = { GERANT: 'Gérant', CUISINE: 'Cuisine', SERVICE: 'Service' };

const navLinkClass = (isActive: boolean) =>
  'flex items-center gap-2.5 px-2.5 py-2 rounded-card-sm text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2 ' +
  (isActive ? 'bg-accent-soft text-accent' : 'text-text-muted hover:bg-surface-hover hover:text-text');

const menuItemClass =
  'block w-full text-left px-3 py-2 text-sm text-text-muted hover:bg-surface-hover hover:text-text';

export default function AppShell() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const { navPath, label } = resolveRoute(location.pathname);
  const visibleNavItems = NAV_ITEMS.filter((item) => !item.roles || (user && item.roles.includes(user.role)));
  const initial = user ? user.firstName.charAt(0).toUpperCase() : '';

  return (
    <div className="min-h-screen grid grid-cols-[210px_1fr] max-[620px]:grid-cols-[176px_1fr] bg-bg bg-app-gradient text-text font-sans">
      <aside className="flex flex-col gap-8 px-4 py-6 border-r border-border">
        <div className="flex items-center gap-[11px]">
          <div className="w-8 h-8 rounded-card-sm bg-logo-fill shadow-logo flex items-center justify-center shrink-0">
            <span className="font-logo italic font-bold text-[19px] leading-none text-accent-text -translate-x-px translate-y-px">
              F
            </span>
          </div>
          <span className="font-logo font-bold text-[17px]">FoodCFO</span>
        </div>

        <nav className="flex flex-col gap-0.5">
          {visibleNavItems.map((item) => (
            <NavLink key={item.path} to={item.path} className={navLinkClass(navPath === item.path)}>
              <span className="w-4 h-4 shrink-0 opacity-85">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex flex-col min-w-0">
        <header className="flex items-center justify-between gap-4 px-6 py-4 border-b border-border">
          <div className="text-sm text-text-muted min-w-0 truncate">
            <b className="text-text font-semibold">FoodCFO</b> / {label}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-56 max-w-[40vw]">
              <RestaurantSwitcher />
            </div>
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="w-[30px] h-[30px] rounded-full bg-accent-soft text-accent flex items-center justify-center font-display text-xs font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
                aria-haspopup="true"
                aria-expanded={menuOpen}
              >
                {initial}
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-card-md border border-border bg-surface backdrop-blur-xl shadow-card py-1.5 z-10">
                  {user && (
                    <div className="px-3 py-2 border-b border-border mb-1">
                      <p className="text-sm font-medium text-text truncate">
                        {user.firstName} {user.lastName}
                      </p>
                      <p className="text-xs text-text-faint">{ROLE_LABELS[user.role]}</p>
                    </div>
                  )}
                  <NavLink to="/account" className={menuItemClass}>
                    Mon compte
                  </NavLink>
                  {user?.role === 'GERANT' && (
                    <>
                      <NavLink to="/team" className={menuItemClass}>
                        Équipe
                      </NavLink>
                      <NavLink to="/billing" className={menuItemClass}>
                        Facturation
                      </NavLink>
                      <NavLink to="/restaurant-settings" className={menuItemClass}>
                        Paramètres du restaurant
                      </NavLink>
                      <NavLink to="/pos" className={menuItemClass}>
                        Caisse enregistreuse
                      </NavLink>
                    </>
                  )}
                  <button onClick={() => logout()} className={menuItemClass + ' border-t border-border mt-1 text-warn'}>
                    Déconnexion
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 min-w-0 px-6 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
