import { NavLink, Outlet } from 'react-router-dom'

export function Layout() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">FN</span>
          <div>
            <p className="brand-name">Flipping Note</p>
            <p className="brand-sub">Inventory, Pricing, Payout</p>
          </div>
        </div>
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            isActive ? 'header-settings active' : 'header-settings'
          }
        >
          設定
        </NavLink>
      </header>

      <main className="app-main">
        <Outlet />
      </main>

      <nav className="tab-bar" aria-label="メインナビ">
        <NavLink to="/" end className={({ isActive }) => (isActive ? 'tab active' : 'tab')}>
          <span className="tab-icon">▣</span>
          一覧
        </NavLink>
        <NavLink to="/profits" className={({ isActive }) => (isActive ? 'tab active' : 'tab')}>
          <span className="tab-icon">¥</span>
          利益
        </NavLink>
        <NavLink to="/items/new" className={({ isActive }) => (isActive ? 'tab active' : 'tab')}>
          <span className="tab-icon">＋</span>
          新規
        </NavLink>
      </nav>
    </div>
  )
}
