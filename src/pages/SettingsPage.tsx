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
    user,
    syncReady,
    syncError,
    retrySync,
    signOut,
  } = useAuth()

  const [minProfitText, setMinProfitText] = useState(String(settings.minProfit))
  const [newName, setNewName] = useState('')
  const [newFee, setNewFee] = useState('10')
  const [message, setMessage] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [syncBusy, setSyncBusy] = useState(false)
  const [savingMinProfit, setSavingMinProfit] = useState(false)
  const [addingMarketplace, setAddingMarketplace] = useState(false)

  async function handleRetrySync() {
    setSyncBusy(true)
    setMessage('')
    try {
      await retrySync()
      setMessage('再同期しました')
    } catch (err) {
      const text = err instanceof Error ? err.message : '再同期に失敗しました'
      setMessage(text)
    } finally {
      setSyncBusy(false)
    }
  }

  async function handleSignOut() {
    setAuthBusy(true)
    setMessage('')
    try {
      await signOut()
    } catch (err) {
      const text = err instanceof Error ? err.message : 'ログアウトに失敗しました'
      setMessage(text)
    } finally {
      setAuthBusy(false)
    }
  }

  async function saveMinProfit(e: FormEvent) {
    e.preventDefault()
    if (savingMinProfit) return
    const n = Number(minProfitText)
    if (!Number.isFinite(n) || n < 0) {
      window.alert('最低利益は0以上の金額で入力してください')
      return
    }
    setSavingMinProfit(true)
    setMessage('')
    try {
      await setMinProfit(n)
      window.alert('最低利益を保存しました')
      setMessage('最低利益を保存しました')
    } catch (err) {
      const text = err instanceof Error ? err.message : '保存に失敗しました'
      setMessage(text)
      window.alert(`保存に失敗しました\n${text}`)
    } finally {
      setSavingMinProfit(false)
    }
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    if (addingMarketplace) return
    const fee = Number(newFee)
    if (!newName.trim()) {
      window.alert('販売先名を入力してください')
      return
    }
    if (!Number.isFinite(fee) || fee < 0 || fee >= 100) {
      window.alert('手数料率は0〜99.9で入力してください')
      return
    }
    setAddingMarketplace(true)
    setMessage('')
    try {
      await addMarketplace(newName, fee)
      setNewName('')
      setNewFee('10')
      window.alert('販売先を追加しました')
      setMessage('販売先を追加しました')
    } catch (err) {
      const text = err instanceof Error ? err.message : '追加に失敗しました'
      setMessage(text)
      window.alert(`追加に失敗しました\n${text}`)
    } finally {
      setAddingMarketplace(false)
    }
  }

  async function persistMarketplace(
    id: string,
    name: string,
    feeRatePercent: number,
  ) {
    try {
      await updateMarketplace(id, name, feeRatePercent)
      window.alert('販売先を保存しました')
      setMessage('販売先を保存しました')
    } catch (err) {
      const text = err instanceof Error ? err.message : '保存に失敗しました'
      setMessage(text)
      window.alert(`保存に失敗しました\n${text}`)
    }
  }

  return (
    <div className="page">
      <div className="page-heading">
        <h1>設定</h1>
        <p className="muted">推奨価格と販売先の初期値を決めます</p>
      </div>

      {message ? <p className="form-message">{message}</p> : null}

      <Section title="アカウント">
        {user ? (
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
                  {syncError
                    ? `同期エラー: ${syncError}`
                    : 'データはクラウドのみに保存されます（端末には残しません）'}
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
        ) : null}
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
          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={savingMinProfit}
          >
            {savingMinProfit ? '保存中…' : '最低利益を保存'}
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
                    key={`${m.id}-name-${m.name}`}
                    defaultValue={m.name}
                    aria-label="販売先名"
                    onBlur={(e) => {
                      const next = e.target.value.trim()
                      if (!next || next === m.name) return
                      void persistMarketplace(m.id, next, m.feeRatePercent)
                    }}
                  />
                  <div className="fee-wrap">
                    <input
                      key={`${m.id}-fee-${m.feeRatePercent}`}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={99.9}
                      step={0.1}
                      defaultValue={m.feeRatePercent}
                      aria-label="手数料率"
                      onBlur={(e) => {
                        const fee = Number(e.target.value) || 0
                        if (fee === m.feeRatePercent) return
                        void persistMarketplace(m.id, m.name, fee)
                      }}
                    />
                    <span className="fee-suffix">%</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => {
                    if (!window.confirm(`「${m.name}」を削除しますか？`)) return
                    void removeMarketplace(m.id)
                      .then(() => setMessage('販売先を削除しました'))
                      .catch((err: unknown) =>
                        setMessage(
                          err instanceof Error ? err.message : '削除に失敗しました',
                        ),
                      )
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
          <button
            type="submit"
            className="btn btn-ghost btn-block"
            disabled={addingMarketplace}
          >
            {addingMarketplace ? '追加中…' : '販売先を追加'}
          </button>
        </form>
      </Section>
    </div>
  )
}
