/** 実質仕入価格 = 仕入価格 - 割引 + 仕入れ送料 */
export function calcEffectiveCost(
  purchasePrice: number,
  discount: number,
  purchaseShipping: number,
): number {
  return purchasePrice - discount + purchaseShipping
}

/** 手数料率（例: 10）を 0〜1 に変換 */
export function toFeeRate(feeRatePercent: number): number {
  return feeRatePercent / 100
}

/**
 * 手数料割引後の実効手数料率（0〜1）
 * 割引50% → 元の手数料の半分
 */
export function toEffectiveFeeRate(
  feeRatePercent: number,
  feeDiscountPercent = 0,
): number {
  const discount = Math.min(Math.max(feeDiscountPercent, 0), 100)
  return toFeeRate(feeRatePercent) * (1 - discount / 100)
}

/**
 * 利益ゼロの理論価格
 * P = (実質仕入 + 販売送料 - クーポン) / (1 - 実効手数料率)
 */
export function calcBreakEvenPrice(
  effectiveCost: number,
  saleShipping: number,
  feeRatePercent: number,
  feeDiscountPercent = 0,
  couponAmount = 0,
): number | null {
  const rate = toEffectiveFeeRate(feeRatePercent, feeDiscountPercent)
  if (rate >= 1) return null
  return (effectiveCost + saleShipping - couponAmount) / (1 - rate)
}

/** 100円単位切り上げ */
export function roundUpTo100(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  return Math.ceil(value / 100) * 100
}

/**
 * 最低利益を確保する推奨販売価格（100円単位切り上げ）
 * P = (実質仕入 + 販売送料 + 最低利益 - クーポン) / (1 - 実効手数料率)
 */
export function calcRecommendedPrice(
  effectiveCost: number,
  saleShipping: number,
  feeRatePercent: number,
  minProfit = 0,
  feeDiscountPercent = 0,
  couponAmount = 0,
): number | null {
  const rate = toEffectiveFeeRate(feeRatePercent, feeDiscountPercent)
  if (rate >= 1) return null
  const raw =
    (effectiveCost + saleShipping + minProfit - couponAmount) / (1 - rate)
  return roundUpTo100(raw)
}

/** 販売手数料 = 販売価格 × 手数料率 × (1 - 手数料割引%) */
export function calcFee(
  salePrice: number,
  feeRatePercent: number,
  feeDiscountPercent = 0,
): number {
  return salePrice * toEffectiveFeeRate(feeRatePercent, feeDiscountPercent)
}

/**
 * 売上金 = 販売価格 - 販売手数料 - 販売送料
 * 手元に残る販売側の入金額（仕入原価・クーポン控除前）
 */
export function calcPayout(
  salePrice: number,
  feeRatePercent: number,
  saleShipping: number,
  feeDiscountPercent = 0,
): number {
  return (
    salePrice - calcFee(salePrice, feeRatePercent, feeDiscountPercent) - saleShipping
  )
}

/**
 * 利益 = 販売価格 - 手数料 - 販売送料 - 実質仕入価格 + クーポン
 */
export function calcProfit(
  salePrice: number,
  feeRatePercent: number,
  saleShipping: number,
  effectiveCost: number,
  feeDiscountPercent = 0,
  couponAmount = 0,
): number {
  return (
    salePrice -
    calcFee(salePrice, feeRatePercent, feeDiscountPercent) -
    saleShipping -
    effectiveCost +
    couponAmount
  )
}

/** 利益率 = 利益 ÷ 販売価格 × 100 */
export function calcProfitRate(profit: number, salePrice: number): number | null {
  if (!Number.isFinite(salePrice) || salePrice <= 0) return null
  return (profit / salePrice) * 100
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return `${value.toFixed(digits)}%`
}

export function formatYen(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
    maximumFractionDigits: 0,
  }).format(Math.round(value))
}

export function formatYenPlain(value: number): string {
  return `${Math.round(value).toLocaleString('ja-JP')}円`
}

export function todayISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7)
}

export function formatMonthLabel(yyyyMm: string): string {
  const [y, m] = yyyyMm.split('-')
  return `${y}年${Number(m)}月`
}
