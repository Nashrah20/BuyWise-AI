import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { Toast } from './Primitives';

const Logo = () => (
  <Link to="/" className="flex items-center gap-2.5">
    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-forest-700">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"
           strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 7h14l-1.2 11a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8L5 7Z" />
        <path d="M9 7V5.5a3 3 0 0 1 6 0V7" />
      </svg>
    </span>
    <span className="font-display text-xl font-semibold tracking-tight text-ink">
      BuyWise <span className="text-forest-700">AI</span>
    </span>
  </Link>
);

function CartLink({ count }) {
  return (
    <NavLink to="/cart" className="btn-ghost relative" aria-label={`Cart, ${count} items`}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
           strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="9" cy="20" r="1.4" />
        <circle cx="18" cy="20" r="1.4" />
        <path d="M2 3h3l2.6 12.4a1.5 1.5 0 0 0 1.5 1.2h8.3a1.5 1.5 0 0 0 1.5-1.2L21 7H6" />
      </svg>
      Cart
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-forest-700 px-1 text-[10px] font-bold text-white">
          {count}
        </span>
      )}
    </NavLink>
  );
}

export default function Layout() {
  const { user, cartCount, signOut, toast, isMerchant } = useApp();
  const { pathname } = useLocation();

  const navClass = ({ isActive }) =>
    `rounded-lg px-3 py-2 text-sm font-medium transition ${
      isActive ? 'bg-forest-50 text-forest-700' : 'text-ink-soft hover:bg-line-soft hover:text-ink'
    }`;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-paper/85 backdrop-blur">
        <div className="container-page flex h-16 items-center justify-between gap-4">
          <Logo />

          <nav className="hidden items-center gap-1 md:flex">
            <NavLink to="/agent" className={navClass}>
              Shopping agent
            </NavLink>
            <NavLink to="/shop" className={navClass}>
              Browse
            </NavLink>
            {isMerchant && (
              <NavLink to="/merchant" className={navClass}>
                Merchant
              </NavLink>
            )}
            {user && (
              <NavLink to="/orders" className={navClass}>
                Orders
              </NavLink>
            )}
          </nav>

          <div className="flex items-center gap-1.5">
            <CartLink count={cartCount} />
            {user ? (
              <div className="flex items-center gap-2">
                <span className="hidden text-sm text-ink-muted sm:inline">
                  {user.name.split(' ')[0]}
                </span>
                <button type="button" onClick={signOut} className="btn-secondary">
                  Sign out
                </button>
              </div>
            ) : (
              <Link
                to="/signin"
                state={{ from: pathname }}
                className="btn-primary"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>

        {/* Mobile nav */}
        <nav className="flex gap-1 overflow-x-auto border-t border-line-soft px-5 py-2 md:hidden">
          <NavLink to="/agent" className={navClass}>
            Agent
          </NavLink>
          <NavLink to="/shop" className={navClass}>
            Browse
          </NavLink>
          {isMerchant && (
            <NavLink to="/merchant" className={navClass}>
              Merchant
            </NavLink>
          )}
          {user && (
            <NavLink to="/orders" className={navClass}>
              Orders
            </NavLink>
          )}
        </nav>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="mt-16 border-t border-line bg-card">
        <div className="container-page flex flex-col gap-3 py-8 text-sm text-ink-muted sm:flex-row sm:items-center sm:justify-between">
          <p>
            <span className="font-display font-semibold text-ink">BuyWise AI</span> — an autonomous
            shopping agent that understands what you actually need.
          </p>
          <p className="text-xs">Demo build. Payments run in a sandbox; no money moves.</p>
        </div>
      </footer>

      <Toast toast={toast} />
    </div>
  );
}
