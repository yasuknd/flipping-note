import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { calcEffectiveCost, calcPayout, calcProfit, formatYen } from '../calc'
import { MoneyInput } from '../components/MoneyInput'
import { StatusBadge } from '../components/StatusBadge'
import { downloadCsv } from '../csv'
import { useItems } from '../ItemsContext'
import { useSettings } from '../SettingsContext'
import { STATUS_LABEL, STATUS_ORDER, type Item, type ItemInput, type ItemStatus } from '../types'

type Filter =
  | 'all'
  | 'considering'
  | 'inStock'
  | 'listed'
  | 'sold'
  | 'completed'

type SortKey = 'purchaseDate' | 'soldDate'
type SortOrder = 'desc' | 'asc'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'すべて' },
  { key: 'considering', label: '出品検討中' },
  { key: 'inStock', label: '在庫' },
  { key: 'listed', label: '出品中' },
  { key: 'sold', label: '取引中' },
  { key: 'completed', label: '取引完了' },
]

const SORT_KEYS: { key: SortKey; label: string }[] = [
  { key: 'purchaseDate', label: '仕入日' },
  { key: 'soldDate', label: '売却日' },
]

const SORT_ORDERS: { key: SortOrder; label: string }[] = [
  { key: 'desc', label: '新しい順' },
  { key: 'asc', label: '古い順' },
]

function compareByDate(a: string, b: string, order: SortOrder): number {
  const aEmpty = !a
  const bEmpty = !b
  if (aEmpty && bEmpty) return 0
  // 日付未設定は常に末尾
  if (aEmpty) return 1
  if (bEmpty) return -1
  const cmp = a.localeCompare(b)
  return order === 'asc' ? cmp : -cmp
}

function matchesFilter(status: ItemStatus, filter: Filter): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'considering':
      return status === 'considering'
    case 'inStock':
      return status === 'purchased' || status === 'listed'
    case 'listed':
      return status === 'listed'
    case 'sold':
      return status === 'sold'
    case 'completed':
      return status === 'completed'
    default:
      return true
  }
}

function toItemInput(
  item: Item,
  patch: Partial<
    Pick<ItemInput, 'status' | 'salePrice' | 'soldDate' | 'memo' | 'marketplace' | 'feeRatePercent'>
  > = {},
): ItemInput {
  return {
    brand: item.brand,
    name: item.name,
    color: item.color,
    size: item.size,
    modelNumber: item.modelNumber,
    source: item.source,
    purchasePrice: item.purchasePrice,
    discount: item.discount,
    purchaseShipping: item.purchaseShipping,
    purchaseDate: item.purchaseDate,
    memo: patch.memo !== undefined ? patch.memo : item.memo,
    marketplace: patch.marketplace !== undefined ? patch.marketplace : item.marketplace,
    feeRatePercent:
      patch.feeRatePercent !== undefined ? patch.feeRatePercent : item.feeRatePercent,
    feeDiscountPercent: item.feeDiscountPercent,
    saleShipping: item.saleShipping,
    couponAmount: item.couponAmount,
    salePrice: patch.salePrice !== undefined ? patch.salePrice : item.salePrice,
    soldDate: patch.soldDate !== undefined ? patch.soldDate : item.soldDate,
    status: patch.status ?? item.status,
    pointsNote: item.pointsNote,
  }
}

/** 一覧カードからの複製用（新規登録フォームへ渡す） */
function toDuplicateInput(item: Item): ItemInput {
  return toItemInput(item)
}

function formatListDate(value: string): string {
  if (!value) return '---'
  return value.replace(/-/g, '/')
}

function StatusPicker({
  status,
  onChange,
}: {
  status: ItemStatus
  onChange: (status: ItemStatus) => void
}) {
  const [open, setOpen] = useState(false)
  const selectRef = useRef<HTMLSelectElement>(null)

  useEffect(() => {
    if (open) selectRef.current?.focus()
  }, [open])

  if (!open) {
    return (
      <button
        type="button"
        className="status-badge-button"
        onClick={() => setOpen(true)}
        aria-label={`ステータス: ${STATUS_LABEL[status]}（変更）`}
      >
        <StatusBadge status={status} />
      </button>
    )
  }

  return (
    <select
      ref={selectRef}
      className="status-inline-select"
      value={status}
      aria-label="ステータス"
      onChange={(e) => {
        onChange(e.target.value as ItemStatus)
        setOpen(false)
      }}
      onBlur={() => setOpen(false)}
    >
      {STATUS_ORDER.map((key) => (
        <option key={key} value={key}>
          {STATUS_LABEL[key]}
        </option>
      ))}
    </select>
  )
}

function MarketplacePicker({
  item,
  onChange,
}: {
  item: Item
  onChange: (marketplace: string, feeRatePercent: number) => void
}) {
  const { settings } = useSettings()
  const [open, setOpen] = useState(false)
  const selectRef = useRef<HTMLSelectElement>(null)

  const selectedId =
    settings.marketplaces.find(
      (m) => m.name === item.marketplace && m.feeRatePercent === item.feeRatePercent,
    )?.id ??
    settings.marketplaces.find((m) => m.name === item.marketplace)?.id ??
    ''

  useEffect(() => {
    if (open) selectRef.current?.focus()
  }, [open])

  if (!open) {
    return (
      <button
        type="button"
        className="info-tag info-tag-button"
        onClick={() => setOpen(true)}
      >
        出品先：{item.marketplace || '---'}
      </button>
    )
  }

  return (
    <select
      ref={selectRef}
      className="info-tag-select"
      value={selectedId}
      aria-label="出品先"
      onChange={(e) => {
        const preset = settings.marketplaces.find((m) => m.id === e.target.value)
        if (preset) onChange(preset.name, preset.feeRatePercent)
        setOpen(false)
      }}
      onBlur={() => setOpen(false)}
    >
      <option value="">選択してください</option>
      {settings.marketplaces.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}（{m.feeRatePercent}%）
        </option>
      ))}
    </select>
  )
}

function SoldDateCell({
  value,
  onChange,
}: {
  value: string
  onChange: (soldDate: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  function openPicker() {
    const input = inputRef.current
    if (!input) return
    if (typeof input.showPicker === 'function') {
      input.showPicker()
    } else {
      input.focus()
      input.click()
    }
  }

  return (
    <div className="item-date-block">
      <span className="item-date-label">売却日</span>
      <button type="button" className="item-date-value-button" onClick={openPicker}>
        {formatListDate(value)}
      </button>
      <input
        ref={inputRef}
        type="date"
        className="item-date-hidden-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  )
}

function SalePriceCell({
  item,
  onSave,
}: {
  item: Item
  onSave: (salePrice: number | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [raw, setRaw] = useState(item.salePrice != null ? String(item.salePrice) : '')

  useEffect(() => {
    if (!editing) {
      setRaw(item.salePrice != null ? String(item.salePrice) : '')
    }
  }, [editing, item.salePrice])

  if (!editing) {
    return (
      <button
        type="button"
        className="stat-value-button"
        onClick={() => setEditing(true)}
      >
        {item.salePrice != null ? formatYen(item.salePrice) : '未設定'}
      </button>
    )
  }

  return (
    <MoneyInput
      id={`sale-price-${item.id}`}
      className="money-input-compact"
      value={raw}
      placeholder="未設定"
      autoFocus
      onChange={setRaw}
      onBlur={() => {
        const next = raw === '' ? null : Number(raw)
        setEditing(false)
        if (next === item.salePrice) return
        if (next != null && !Number.isFinite(next)) return
        onSave(next)
      }}
    />
  )
}

function MemoCell({
  item,
  onSave,
}: {
  item: Item
  onSave: (memo: string) => void
}) {
  const [value, setValue] = useState(item.memo)

  useEffect(() => {
    setValue(item.memo)
  }, [item.memo])

  return (
    <div className="item-memo">
      <span className="stat-label">メモ</span>
      <input
        type="text"
        className="item-memo-input"
        value={value}
        placeholder="メモを入力"
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          const next = value.trim()
          if (next === item.memo.trim()) return
          onSave(next)
        }}
      />
    </div>
  )
}

export function ListPage() {
  const { items, save } = useItems()
  const [filter, setFilter] = useState<Filter>('all')
  const [sortKey, setSortKey] = useState<SortKey>('purchaseDate')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')

  const filtered = useMemo(() => {
    const list = items.filter((item) => matchesFilter(item.status, filter))
    return [...list].sort((a, b) =>
      compareByDate(a[sortKey], b[sortKey], sortOrder),
    )
  }, [items, filter, sortKey, sortOrder])

  async function persist(itemId: string, input: ReturnType<typeof toItemInput>) {
    try {
      await save(itemId, input)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'クラウドへの保存に失敗しました')
    }
  }

  function handleStatusChange(item: Item, nextStatus: ItemStatus) {
    if (
      (nextStatus === 'sold' || nextStatus === 'completed') &&
      (!item.salePrice || !item.soldDate)
    ) {
      window.alert('取引中または取引完了にするには、販売価格と売却日を先に入力してください。')
      return
    }
    void persist(item.id, toItemInput(item, { status: nextStatus }))
  }

  function handleSalePriceChange(item: Item, salePrice: number | null) {
    void persist(item.id, toItemInput(item, { salePrice }))
  }

  function handleSoldDateChange(item: Item, soldDate: string) {
    if (soldDate) {
      void persist(
        item.id,
        toItemInput(item, {
          soldDate,
          status: item.status === 'completed' ? 'completed' : 'sold',
        }),
      )
      return
    }
    void persist(
      item.id,
      toItemInput(item, {
        soldDate: '',
        status: 'listed',
      }),
    )
  }

  function handleMemoChange(item: Item, memo: string) {
    void persist(item.id, toItemInput(item, { memo }))
  }

  function handleMarketplaceChange(
    item: Item,
    marketplace: string,
    feeRatePercent: number,
  ) {
    void persist(item.id, toItemInput(item, { marketplace, feeRatePercent }))
  }

  function exportListCsv() {
    const rows = filtered.map((item) => {
      const cost = calcEffectiveCost(
        item.purchasePrice,
        item.discount,
        item.purchaseShipping,
      )
      const profit =
        item.salePrice != null
          ? calcProfit(
              item.salePrice,
              item.feeRatePercent,
              item.saleShipping,
              cost,
              item.feeDiscountPercent,
              item.couponAmount,
            )
          : null
      const payout =
        item.salePrice != null
          ? calcPayout(
              item.salePrice,
              item.feeRatePercent,
              item.saleShipping,
              item.feeDiscountPercent,
            )
          : null

      return [
        STATUS_LABEL[item.status],
        item.brand,
        item.name,
        item.color,
        item.size,
        item.modelNumber,
        item.source,
        item.purchaseDate,
        item.marketplace,
        item.soldDate,
        cost,
        item.salePrice,
        item.feeDiscountPercent,
        item.couponAmount,
        payout,
        profit,
        item.memo,
      ]
    })

    downloadCsv(
      'flipping-note-list.csv',
      [
        'ステータス',
        'ブランド',
        '商品名',
        'カラー',
        'サイズ',
        '型番',
        '仕入元',
        '仕入日',
        '出品先',
        '売却日',
        '実質仕入価格',
        '販売価格',
        '手数料割引%',
        'クーポン',
        '売上金',
        '利益',
        'メモ',
      ],
      rows,
    )
  }

  return (
    <div className="page">
      <div className="page-heading page-heading-split">
        <div>
          <h1>一覧</h1>
          <p className="muted">
            {filtered.length}件表示 / 全{items.length}件
          </p>
        </div>
        <button type="button" className="btn btn-secondary btn-compact" onClick={exportListCsv}>
          CSV出力
        </button>
      </div>

      <div className="chip-row" role="tablist" aria-label="絞り込み">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={filter === f.key}
            className={filter === f.key ? 'chip active' : 'chip'}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="sort-bar" aria-label="並び替え">
        <label className="sort-field">
          <span className="sort-label">並び替え</span>
          <select
            value={sortKey}
            aria-label="並び替え項目"
            onChange={(e) => setSortKey(e.target.value as SortKey)}
          >
            {SORT_KEYS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="sort-field">
          <span className="sort-label">順序</span>
          <select
            value={sortOrder}
            aria-label="並び順"
            onChange={(e) => setSortOrder(e.target.value as SortOrder)}
          >
            {SORT_ORDERS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {filtered.length === 0 ? (
        <div className="empty">
          <p>該当する商品がありません</p>
          <Link to="/items/new" className="btn btn-primary">
            商品を登録
          </Link>
        </div>
      ) : (
        <ul className="item-list">
          {filtered.map((item) => {
            const cost = calcEffectiveCost(
              item.purchasePrice,
              item.discount,
              item.purchaseShipping,
            )
            const profit =
              item.salePrice != null
                ? calcProfit(
                    item.salePrice,
                    item.feeRatePercent,
                    item.saleShipping,
                    cost,
                    item.feeDiscountPercent,
                    item.couponAmount,
                  )
                : null
            const payout =
              item.salePrice != null
                ? calcPayout(
                    item.salePrice,
                    item.feeRatePercent,
                    item.saleShipping,
                    item.feeDiscountPercent,
                  )
                : null
            const metaLine = [item.brand, item.color, item.size, item.modelNumber]
              .filter(Boolean)
              .join('／')

            return (
              <li key={item.id}>
                <div className="item-card item-card-compact">
                  <div className="item-card-body">
                    <div className="item-card-main">
                      <div className="item-card-top">
                        <StatusPicker
                          status={item.status}
                          onChange={(status) => handleStatusChange(item, status)}
                        />
                        <div className="item-card-actions">
                          <Link to={`/items/${item.id}`} className="item-edit-link">
                            編集
                          </Link>
                          <Link
                            to="/items/new"
                            state={{ duplicate: toDuplicateInput(item) }}
                            className="item-edit-link"
                          >
                            複製
                          </Link>
                        </div>
                      </div>

                      <div className="item-tag-row">
                        <span className="info-tag">
                          仕入元：{item.source || '---'}
                        </span>
                        <MarketplacePicker
                          item={item}
                          onChange={(marketplace, feeRatePercent) =>
                            handleMarketplaceChange(item, marketplace, feeRatePercent)
                          }
                        />
                      </div>

                      <h2 className="item-name">{item.name || '商品名未設定'}</h2>
                      {metaLine ? <p className="item-meta">{metaLine}</p> : null}
                    </div>

                    <div className="item-card-side">
                      <div className="item-date-block">
                        <span className="item-date-label">仕入日</span>
                        <span className="item-date-value">
                          {formatListDate(item.purchaseDate)}
                        </span>
                      </div>
                      <SoldDateCell
                        value={item.soldDate}
                        onChange={(soldDate) => handleSoldDateChange(item, soldDate)}
                      />
                    </div>
                  </div>

                  <div className="item-stats item-stats-4">
                    <div>
                      <span className="stat-label">実質仕入価格</span>
                      <span className="stat-value">{formatYen(cost)}</span>
                    </div>
                    <div className="stat-editable">
                      <span className="stat-label">販売価格</span>
                      <SalePriceCell
                        item={item}
                        onSave={(salePrice) => handleSalePriceChange(item, salePrice)}
                      />
                    </div>
                    <div>
                      <span className="stat-label">売上金</span>
                      <span className="stat-value">
                        {payout == null ? '—' : formatYen(payout)}
                      </span>
                    </div>
                    <div>
                      <span className="stat-label">利益</span>
                      <span
                        className={`stat-value ${
                          profit == null
                            ? ''
                            : profit >= 0
                              ? 'text-positive'
                              : 'text-negative'
                        }`}
                      >
                        {profit == null ? '—' : formatYen(profit)}
                      </span>
                    </div>
                  </div>

                  <MemoCell
                    item={item}
                    onSave={(memo) => handleMemoChange(item, memo)}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
