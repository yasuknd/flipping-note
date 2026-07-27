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
        item.feeDiscountPercent,
        item.couponAmount,
      )
      const payout = calcPayout(
        item.salePrice!,
        item.feeRatePercent,
        item.saleShipping,
        item.feeDiscountPercent,
        item.couponAmount,
      )
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
  const totalSettledPayout = useMemo(
    () => byMonth.reduce((sum, row) => sum + row.settledPayout, 0),
    [byMonth],
  )
  const totalPendingPayout = useMemo(
    () => byMonth.reduce((sum, row) => sum + row.pendingPayout, 0),
    [byMonth],
  )
  const totalPayout = totalSettledPayout + totalPendingPayout
  /** 見込利益 = 取引完了＋取引中 */
  const expectedProfit = useMemo(
    () => byMonth.reduce((sum, row) => sum + row.settled + row.pending, 0),
    [byMonth],
  )

  const defaultMonth = byMonth[0]?.month ?? ''
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth)
  const activeMonth = selectedMonth || defaultMonth
  const selected = byMonth.find((row) => row.month === activeMonth)

  function exportProfitsCsv() {
    downloadCsv(
      'flipping-note-profits.csv',
      [
        '月',
        '総売上金（取引完了）',
        '総売上金（完了＋取引中）',
        '確定利益',
        '見込利益（完了＋取引中）',
        '確定件数',
        '取引中件数',
        '総仕入れ額（実質）',
      ],
      [
        ...byMonth.map((row) => [
          formatMonthLabel(row.month),
          row.settledPayout,
          row.settledPayout + row.pendingPayout,
          row.settled,
          row.settled + row.pending,
          row.settledCount,
          row.pendingCount,
          '',
        ]),
        [
          '合計',
          totalSettledPayout,
          totalPayout,
          totalSettled,
          expectedProfit,
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
            総売上金の太字は取引完了分、カッコ内は取引完了＋取引中。見込利益は両方の合計です。
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
          label="総仕入れ額（実質）"
          value={formatYen(totalPurchaseCost)}
          emphasis="neutral"
        />
        <Metric
          label="総売上金（見込）"
          value={formatYen(totalSettledPayout)}
          note={`（${formatYen(totalPayout)}）`}
          emphasis="neutral"
        />
      </div>

      <div className="hero-metrics hero-metrics-2">
        <Metric
          label="確定利益"
          value={formatYen(totalSettled)}
          emphasis={totalSettled >= 0 ? 'positive' : 'negative'}
        />
        <Metric
          label="見込利益"
          value={formatYen(expectedProfit)}
          emphasis={expectedProfit >= 0 ? 'positive' : 'negative'}
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
              <div className="hero-metrics hero-metrics-2">
                <Metric
                  label="総売上金（見込）"
                  value={formatYen(selected.settledPayout)}
                  note={`（${formatYen(selected.settledPayout + selected.pendingPayout)}）`}
                  emphasis="neutral"
                />
                <Metric
                  label="見込利益"
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
                  label="取引中利益"
                  value={formatYen(selected.pending)}
                  emphasis={selected.pending >= 0 ? 'neutral' : 'negative'}
                />
                <Metric
                  label="件数"
                  value={`完了${selected.settledCount}／取引中${selected.pendingCount}`}
                  valueClassName="metric-value-compact"
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
                        総売上金 {formatYen(row.settledPayout)}
                        （{formatYen(row.settledPayout + row.pendingPayout)}）
                      </span>
                      <span className="month-row-sub">
                        確定 {formatYen(row.settled)} / 見込{' '}
                        {formatYen(row.settled + row.pending)}
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
