import {
  BarChart3,
  Bot,
  CreditCard,
  LifeBuoy,
  MessageSquare,
  Radio,
  Signal,
  SmartphoneNfc,
  User,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import styles from './AppLayout.module.css';

const NAV_ITEMS: Array<{ to: string; label: string; icon: ReactNode }> = [
  { to: '/chat', label: 'Assistant', icon: <MessageSquare size={18} /> },
    { to: '/dashboard', label: 'Agent Dashboard', icon: <Bot size={18} /> },
  { to: '/profile', label: 'Profile', icon: <User size={18} /> },
  { to: '/analytics', label: 'Analytics', icon: <BarChart3 size={18} /> },
  { to: '/plans', label: 'Plans', icon: <Signal size={18} /> },
  { to: '/billing', label: 'Billing', icon: <CreditCard size={18} /> },
  { to: '/roaming', label: 'Roaming', icon: <Radio size={18} /> },
  { to: '/esim', label: 'eSIM', icon: <SmartphoneNfc size={18} /> },
  { to: '/support', label: 'Support', icon: <LifeBuoy size={18} /> },
];

export function AppLayout() {
  const { user, logout } = useAuth();

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          Telecom<span className={styles.brandAccent}>AI</span> Self-Care
        </div>
        <nav className={styles.nav}>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                isActive ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className={styles.footer}>
          <div className={styles.username}>{user?.username ?? 'Guest'}</div>
          <button className={styles.logoutButton} onClick={logout} type="button">
            Log out
          </button>
        </div>
      </aside>
      <main className={styles.content}>
        <Outlet />
      </main>
    </div>
  );
}

export default AppLayout;
