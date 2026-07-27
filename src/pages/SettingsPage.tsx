import { useState, type FormEvent } from 'react'
import { useAuth } from '../AuthContext'
import { Field, Section } from '../components/Field'
import { useSettings } from '../SettingsContext'
import { formatYenPlain } from '../calc'

export function SettingsPage() {
  const {
    settings,
    setMinProfit,
    addMarketplace,
    updateMarketplace,
    removeMarketplace,
  } = useSettings()
  const {
    configured,
    ready,
    user,
    syncReady,
    syncError,
    authError,
    clearAuthError,
    retrySync,
    signInWithGoogle,
    signOut,
  } = useAuth()

  const [minProfitText, setMinProfitText] = useState(String(settings.minProfit))
  const [newName, setNewName] = useState('')
  const [newFee, setNewFee] = useState('10')
  const [message, setMessage] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [syncBusy, setSyncBusy] = useState(false)

  async function handleRetrySync() {
    setSyncBusy(true)
    setMessage('')
    try {
      await retrySync()
      setMessage('再同期を開始しました')
    } catch (err) {
      const text = err instanceof Error ? err.message : '再同期に失敗しました'
      setMessage(text)
    } finally {
      setSyncBusy(false)
    }
  }

  async function handleSignIn() {
    setAuthBusy(true)
    setMessage('')
    clearAuthError()
    try {
      await signInWithGoogle()
      setMessage('Googleアカウントでログインしました。PCとスマホで同期されます。')
    } catch (err) {
      const text = err instanceof Error ? err.message : 'ログインに失敗しました'
      setMessage(text)
    } finally {
      setAuthBusy(false)
    }
  }

  async function handleSignOut() {
    setAuthBusy(true)
    setMessage('')
    try {
      await signOut()
      setMessage('ログアウトしました。この端末のローカルデータは残ります。')
    } catch (err) {
      const text = err instanceof Error ? err.message : 'ログアウトに失敗しました'
      setMessage(text)
    } finally {
      setAuthBusy(false)
    }
  }

  function saveMinProfit(e: FormEvent) {
    e.preventDefault()
    const n = Number(minProfitText)
    if (!Number.isFinite(n) || n < 0) {
      setMessage('最低利益は0以上の金額で入力してください')
      return
    }
    setMinProfit(n)
    setMessage('最低利益を保存しました')
  }

  function handleAdd(e: FormEvent) {
    e.preventDefault()
    const fee = Number(newFee)
    if (!newName.trim()) {
      setMessage('販売先名を入力してください')
      return
    }
    if (!Number.isFinite(fee) || fee < 0 || fee >= 100) {
      setMessage('手数料率は0〜99.9で入力してください')
      return
    }
    addMarketplace(newName, fee)
    setNewName('')
    setNewFee('10')
    setMessage('販売先を追加しました')
  }

  return (
    <div className="page">
      <div className="page-heading">
        <h1>設定</h1>
        <p className="muted">推奨価格と販売先の初期値を決めます</p>
      </div>

      <Section title="アカウント同期">
        {!configured ? (
          <p className="muted tight">
            Firebase 未設定のため、この環境では端末内保存のみです。セットアップ後に Google
            ログインで PC／スマホ同期が使えます。
          </p>
        ) : !ready ? (
          <p className="muted tight">認証状態を確認中…</p>
        ) : user ? (
          <div className="account-panel">
            <div className="account-row">
              {user.photoURL ? (
                <img
                  className="account-avatar"
                  src={user.photoURL}
                  alt=""
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="account-avatar account-avatar-fallback">G</span>
              )}
              <div>
                <p className="account-name">{user.displayName || 'Googleユーザー'}</p>
                <p className="muted tight">{user.email}</p>
                <p className="muted tight">
                  {!syncReady
                    ? 'クラウドと同期中…'
                    : syncError
                      ? `同期エラー: ${syncError}`
                      : 'クラウド同期オン（この Google アカウント配下）'}
                </p>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-block"
              disabled={authBusy || syncBusy || !syncReady}
              onClick={() => void handleRetrySync()}
            >
              再同期
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-block"
              disabled={authBusy}
              onClick={() => void handleSignOut()}
            >
              ログアウト
            </button>
          </div>
        ) : (
          <div className="account-panel">
            <p className="muted tight">
              Google でログインすると、商品・設定がクラウドに保存され、PCとスマホで同じデータを使えます。
              初回ログイン時に、この端末の既存データがあればクラウドへ取り込みます。
            </p>
            <button
              type="button"
              className="btn btn-primary btn-block"
              disabled={authBusy}
              onClick={() => void handleSignIn()}
            >
              Googleでログイン
            </button>
          </div>
        )}
      </Section>

      <Section title="最低限ほしい利益">
        <form className="stack-form" onSubmit={saveMinProfit}>
          <Field
            label="金額（円）"
            hint={`推奨販売価格は「利益${formatYenPlain(settings.minProfit)}以上」になるよう計算されます`}
          >
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={100}
              value={minProfitText}
              onChange={(e) => setMinProfitText(e.target.value)}
            />
          </Field>
          <button type="submit" className="btn btn-primary btn-block">
            最低利益を保存
          </button>
        </form>
      </Section>

      <Section title="販売先登録">
        <p className="muted tight">
          販売先と手数料率のセットを登録すると、商品登録時にプルダウンで選べます。
        </p>

        <ul className="preset-list">
          {settings.marketplaces.length === 0 ? (
            <li className="muted">まだ販売先がありません</li>
          ) : (
            settings.marketplaces.map((m) => (
              <li key={m.id} className="preset-row">
                <div className="preset-fields">
                  <input
                    value={m.name}
                    aria-label="販売先名"
                    onChange={(e) =>
                      updateMarketplace(m.id, e.target.value, m.feeRatePercent)
                    }
                  />
                  <div className="fee-wrap">
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={99.9}
                      step={0.1}
                      value={m.feeRatePercent}
                      aria-label="手数料率"
                      onChange={(e) =>
                        updateMarketplace(
                          m.id,
                          m.name,
                          Number(e.target.value) || 0,
                        )
                      }
                    />
                    <span className="fee-suffix">%</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => {
                    if (window.confirm(`「${m.name}」を削除しますか？`)) {
                      removeMarketplace(m.id)
                    }
                  }}
                >
                  削除
                </button>
              </li>
            ))
          )}
        </ul>

        <form className="stack-form add-preset" onSubmit={handleAdd}>
          <h3 className="subhead">販売先を追加</h3>
          <div className="grid-2">
            <Field label="販売先名">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="例: メルカリ"
                autoComplete="off"
              />
            </Field>
            <Field label="手数料率（%）">
              <input
                type="number"
                inputMode="decimal"
                min={0}
                max={99.9}
                step={0.1}
                value={newFee}
                onChange={(e) => setNewFee(e.target.value)}
              />
            </Field>
          </div>
          <button type="submit" className="btn btn-ghost btn-block">
            販売先を追加
          </button>
        </form>
      </Section>

      {authError ? <p className="form-message">{authError}</p> : null}
      {message ? <p className="form-message">{message}</p> : null}
    </div>
  )
}
