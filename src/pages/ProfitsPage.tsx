import { useMemo, useState } from 'react'
import {
  calcEffectiveCost,
  calcPayout,
  calcProfit,
  formatMonthLabel,
  formatYen,
  monthKey,
} from '../calc'
import { downloadCsv } from '../csv'
import { Metric } from '../components/Field'
import { useItems } from '../ItemsContext'
import { COMPLETED_STATUSES, PENDING_STATUSES } from '../types'

type MonthRow = {
  month: string
  settled: number
  pending: number
  settledPayout: number
  pendingPayout: number
  settledCount: number
  pendingCount: number
}

export function ProfitsPage() {
  const { items } = useItems()

  const settledItems = useMemo(
    () =>
      items.filter(
        (item) =>
          COMPLETED_STATUSES.includes(item.status) &&
          item.salePrice != null &&
          item.soldDate,
      ),
    [items],
  )

  const pendingItems = useMemo(
    () =>
      items.filter(
        (item) =>
          PENDING_STATUSES.includes(item.status) &&
          item.salePrice != null &&
          item.soldDate,
      ),
    [items],
  )

  /** 仕入れ済み（検討中以外）の実質仕入価格合計 */
  const totalPurchaseCost = useMemo(
    () =>
      items
        .filter((item) => item.status !== 'considering')
        .reduce(
          (sum, item) =>
            sum +
            calcEffectiveCost(item.purchasePrice, item.discount, item.purchaseShipping),
          0,
        ),
    [items],
  )

  const byMonth = useMemo(() => {
    const map = new Map<string, Omit<MonthRow, 'month'>>()

    const addToMonth = (kind: 'settled' | 'pending', item: (typeof items)[number]) => {
      const key = monthKey(item.soldDate)
      const cost = calcEffectiveCost(
        item.purchasePrice,
        item.discount,
        item.purchaseShipping,
      )
      const profit = calcProfit(
        item.salePrice!,
        item.feeRatePercent,
        item.saleShipping,
        cost,
      )
      const payout = calcPayout(item.salePrice!, item.feeRatePercent, item.saleShipping)
      const prev = map.get(key) ?? {
        settled: 0,
        pending: 0,
        settledPayout: 0,
        pendingPayout: 0,
        settledCount: 0,
        pendingCount: 0,
      }
      map.set(key, {
        settled: prev.settled + (kind === 'settled' ? profit : 0),
        pending: prev.pending + (kind === 'pending' ? profit : 0),
        settledPayout: prev.settledPayout + (kind === 'settled' ? payout : 0),
        pendingPayout: prev.pendingPayout + (kind === 'pending' ? payout : 0),
        settledCount: prev.settledCount + (kind === 'settled' ? 1 : 0),
        pendingCount: prev.pendingCount + (kind === 'pending' ? 1 : 0),
      })
    }

    settledItems.forEach((item) => addToMonth('settled', item))
    pendingItems.forEach((item) => addToMonth('pending', item))

    return [...map.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([month, data]) => ({ month, ...data }))
  }, [pendingItems, settledItems, items])

  const totalSettled = useMemo(
    () => byMonth.reduce((sum, row) => sum + row.settled, 0),
    [byMonth],
  )
  const totalPending = useMemo(
    () => byMonth.reduce((sum, row) => sum + row.pending, 0),
    [byMonth],
  )
  const totalSettledPayout = useMemo(
    () => byMonth.reduce((sum, row) => sum + row.settledPayout, 0),
    [byMonth],
  )
  const totalPendingPayout = useMemo(
    () => byMonth.reduce((sum, row) => sum + row.pendingPayout, 0),
    [byMonth],
  )
  const totalPayout = totalSettledPayout + totalPendingPayout
  const totalProfit = totalSettled + totalPending

  const defaultMonth = byMonth[0]?.month ?? ''
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth)
  const activeMonth = selectedMonth || defaultMonth
  const selected = byMonth.find((row) => row.month === activeMonth)

  function exportProfitsCsv() {
    downloadCsv(
      'flipping-note-profits.csv',
      [
        '月',
        '売上金',
        '売上金（見込）',
        '確定利益',
        '見込利益',
        '合計利益',
        '確定件数',
        '取引中件数',
        '総仕入れ価格（実質）',
      ],
      [
        ...byMonth.map((row) => [
          formatMonthLabel(row.month),
          row.settledPayout + row.pendingPayout,
          row.pendingPayout,
          row.settled,
          row.pending,
          row.settled + row.pending,
          row.settledCount,
          row.pendingCount,
          '',
        ]),
        [
          '合計',
          totalPayout,
          totalPendingPayout,
          totalSettled,
          totalPending,
          totalProfit,
          settledItems.length,
          pendingItems.length,
          totalPurchaseCost,
        ],
      ],
    )
  }

  return (
    <div className="page">
      <div className="page-heading page-heading-split">
        <div>
          <h1>利益</h1>
          <p className="muted">
            売上金（見込）は取引中分。カッコ内は確定＋見込の合計（販売価格−手数料−送料）
          </p>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-compact"
          onClick={exportProfitsCsv}
        >
          CSV出力
        </button>
      </div>

      <div className="hero-metrics hero-metrics-2">
        <Metric
          label="総仕入れ価格（実質）"
          value={formatYen(totalPurchaseCost)}
          emphasis="neutral"
        />
        <Metric
          label="売上金（見込）"
          value={formatYen(totalPendingPayout)}
          note={`（${formatYen(totalPayout)}）`}
          emphasis="neutral"
        />
      </div>

      <div className="hero-metrics hero-metrics-3">
        <Metric
          label="確定利益"
          value={formatYen(totalSettled)}
          emphasis={totalSettled >= 0 ? 'positive' : 'negative'}
        />
        <Metric
          label="見込利益"
          value={formatYen(totalPending)}
          emphasis={totalPending >= 0 ? 'neutral' : 'negative'}
        />
        <Metric
          label="合計利益"
          value={formatYen(totalProfit)}
          emphasis={totalProfit >= 0 ? 'positive' : 'negative'}
        />
      </div>

      {byMonth.length === 0 ? (
        <div className="empty">
          <p>取引中または取引完了の商品がまだありません</p>
        </div>
      ) : (
        <>
          <label className="field">
            <span className="field-label">月を選択</span>
            <select
              value={activeMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
            >
              {byMonth.map((row) => (
                <option key={row.month} value={row.month}>
                  {formatMonthLabel(row.month)}
                </option>
              ))}
            </select>
          </label>

          {selected ? (
            <div className="month-card">
              <h2>{formatMonthLabel(selected.month)}</h2>
              <div className="hero-metrics">
                <Metric
                  label="売上金（見込）"
                  value={formatYen(selected.pendingPayout)}
                  note={`（${formatYen(selected.settledPayout + selected.pendingPayout)}）`}
                  emphasis="neutral"
                />
                <Metric
                  label="合計利益"
                  value={formatYen(selected.settled + selected.pending)}
                  emphasis={
                    selected.settled + selected.pending >= 0 ? 'positive' : 'negative'
                  }
                />
              </div>
              <div className="hero-metrics hero-metrics-3">
                <Metric
                  label="確定利益"
                  value={formatYen(selected.settled)}
                  emphasis={selected.settled >= 0 ? 'positive' : 'negative'}
                />
                <Metric
                  label="見込利益"
                  value={formatYen(selected.pending)}
                  emphasis={selected.pending >= 0 ? 'neutral' : 'negative'}
                />
                <Metric
                  label="件数"
                  value={`完了${selected.settledCount} / 取引中${selected.pendingCount}`}
                />
              </div>
            </div>
          ) : null}

          <section className="section">
            <h2 className="section-title">月別サマリー</h2>
            <ul className="month-list">
              {byMonth.map((row) => (
                <li key={row.month}>
                  <button
                    type="button"
                    className={
                      row.month === activeMonth ? 'month-row active' : 'month-row'
                    }
                    onClick={() => setSelectedMonth(row.month)}
                  >
                    <span>{formatMonthLabel(row.month)}</span>
                    <div className="month-row-values">
                      <span className="month-row-sub">
                        売上金（見込） {formatYen(row.pendingPayout)}
                        （{formatYen(row.settledPayout + row.pendingPayout)}）
                      </span>
                      <span className="month-row-sub">
                        確定 {formatYen(row.settled)} / 見込 {formatYen(row.pending)}
                      </span>
                      <span
                        className={
                          row.settled + row.pending >= 0
                            ? 'text-positive'
                            : 'text-negative'
                        }
                      >
                        {formatYen(row.settled + row.pending)}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  )
}
