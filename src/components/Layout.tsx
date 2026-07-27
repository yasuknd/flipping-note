import { NavLink, Outlet } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '../AuthContext'

function LoginScreen() {
  const { configured, authError, clearAuthError, signInWithGoogle, syncError } = useAuth()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function handleSignIn() {
    setBusy(true)
    setMessage('')
    clearAuthError()
    try {
      await signInWithGoogle()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'ログインに失敗しました')
    } finally {
      setBusy(false)
    }
  }

  if (!configured) {
    return (
      <div className="page auth-gate">
        <h1>Flipping Note</h1>
        <p className="muted">
          Firebase が未設定のため利用できません。管理者に設定を依頼してください。
        </p>
      </div>
    )
  }

  return (
    <div className="page auth-gate">
      <h1>Flipping Note</h1>
      <p className="muted">
        Google アカウントでログインしてください。データはクラウドに保存され、PCとスマホで同期されます。
      </p>
      <button
        type="button"
        className="btn btn-primary btn-block"
        disabled={busy}
        onClick={() => void handleSignIn()}
      >
        Googleでログイン
      </button>
      {authError ? <p className="form-message">{authError}</p> : null}
      {syncError ? <p className="form-message">{syncError}</p> : null}
      {message ? <p className="form-message">{message}</p> : null}
    </div>
  )
}

export function Layout() {
  const { ready, user, syncReady, syncError } = useAuth()

  if (!ready) {
    return (
      <div className="app-shell">
        <main className="app-main">
          <div className="page auth-gate">
            <p className="muted">読み込み中…</p>
          </div>
        </main>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="app-shell">
        <main className="app-main">
          <LoginScreen />
        </main>
      </div>
    )
  }

  if (!syncReady) {
    return (
      <div className="app-shell">
        <main className="app-main">
          <div className="page auth-gate">
            <p className="muted">クラウドと同期中…</p>
            {syncError ? <p className="form-message">{syncError}</p> : null}
          </div>
        </main>
      </div>
    )
  }

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
        {syncError ? <p className="form-message sync-banner">{syncError}</p> : null}
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
