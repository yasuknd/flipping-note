export type ItemStatus =
  | 'considering'
  | 'purchased'
  | 'listed'
  | 'sold'
  | 'completed'

export interface Item {
  id: string
  brand: string
  name: string
  color: string
  size: string
  modelNumber: string
  source: string
  purchasePrice: number
  discount: number
  purchaseShipping: number
  purchaseDate: string
  memo: string
  marketplace: string
  feeRatePercent: number
  /** 手数料割引（%）。販売手数料率に対する割引 */
  feeDiscountPercent: number
  saleShipping: number
  /** クーポン（円）。利益に上乗せ */
  couponAmount: number
  salePrice: number | null
  soldDate: string
  status: ItemStatus
  pointsNote: string
  createdAt: string
  updatedAt: string
}

export type ItemInput = Omit<Item, 'id' | 'createdAt' | 'updatedAt'>

export interface MarketplacePreset {
  id: string
  name: string
  feeRatePercent: number
}

export interface AppSettings {
  /** 最低限ほしい利益（円） */
  minProfit: number
  marketplaces: MarketplacePreset[]
}

export const STATUS_LABEL: Record<ItemStatus, string> = {
  considering: '出品検討中',
  purchased: '仕入済',
  listed: '出品中',
  sold: '取引中',
  completed: '取引完了',
}

/** 入力フォームで選べる順序 */
export const STATUS_ORDER: ItemStatus[] = [
  'considering',
  'purchased',
  'listed',
  'sold',
  'completed',
]

/** 取引成立（売れた）＝売却日があるステータス */
export const SOLD_STATUSES: ItemStatus[] = ['sold', 'completed']

/** 確定利益に含めるステータス */
export const COMPLETED_STATUSES: ItemStatus[] = ['completed']

/** まだ入金前の見込み利益 */
export const PENDING_STATUSES: ItemStatus[] = ['sold']

export const DEFAULT_SETTINGS: AppSettings = {
  minProfit: 500,
  marketplaces: [
    { id: 'mercari', name: 'メルカリ', feeRatePercent: 10 },
    { id: 'rakuma', name: 'ラクマ', feeRatePercent: 10 },
  ],
}

export const EMPTY_ITEM_INPUT: ItemInput = {
  brand: '',
  name: '',
  color: '',
  size: '',
  modelNumber: '',
  source: '',
  purchasePrice: 0,
  discount: 0,
  purchaseShipping: 0,
  purchaseDate: '',
  memo: '',
  marketplace: '',
  feeRatePercent: 10,
  feeDiscountPercent: 0,
  saleShipping: 0,
  couponAmount: 0,
  salePrice: null,
  soldDate: '',
  status: 'purchased',
  pointsNote: '',
}

/** 古い保存データとの互換 */
export function normalizeItem(raw: Partial<Item> & { id: string }): Item {
  const legacyStatus = raw.status as string | undefined
  const rawStatus =
    legacyStatus === 'cancelled' ? 'purchased' : raw.status ?? EMPTY_ITEM_INPUT.status
  return {
    ...EMPTY_ITEM_INPUT,
    ...raw,
    status: rawStatus,
    color: raw.color ?? '',
    size: raw.size ?? '',
    modelNumber: raw.modelNumber ?? '',
    feeDiscountPercent:
      typeof raw.feeDiscountPercent === 'number' && Number.isFinite(raw.feeDiscountPercent)
        ? raw.feeDiscountPercent
        : 0,
    couponAmount:
      typeof raw.couponAmount === 'number' && Number.isFinite(raw.couponAmount)
        ? raw.couponAmount
        : 0,
    id: raw.id,
    createdAt: raw.createdAt ?? new Date().toISOString(),
    updatedAt: raw.updatedAt ?? new Date().toISOString(),
  }
}
