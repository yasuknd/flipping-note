import type { AppSettings, Item, ItemInput, MarketplacePreset } from './types'
import { DEFAULT_SETTINGS, normalizeItem } from './types'

const ITEMS_KEY = 'sedori-items-v1'
const SETTINGS_KEY = 'sedori-settings-v1'

function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `id_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

export function loadItems(): Item[] {
  try {
    const raw = localStorage.getItem(ITEMS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Partial<Item>[]
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item): item is Partial<Item> & { id: string } => Boolean(item?.id))
      .map(normalizeItem)
  } catch {
    return []
  }
}

export function saveItems(items: Item[]): void {
  localStorage.setItem(ITEMS_KEY, JSON.stringify(items))
}

export function upsertItem(items: Item[], id: string | null, input: ItemInput): Item[] {
  const now = new Date().toISOString()
  if (id) {
    return items.map((item) =>
      item.id === id ? { ...item, ...input, id, updatedAt: now } : item,
    )
  }
  const next: Item = {
    ...input,
    id: createId(),
    createdAt: now,
    updatedAt: now,
  }
  return [next, ...items]
}

export function deleteItem(items: Item[], id: string): Item[] {
  return items.filter((item) => item.id !== id)
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return structuredClone(DEFAULT_SETTINGS)
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    return {
      minProfit:
        typeof parsed.minProfit === 'number' && Number.isFinite(parsed.minProfit)
          ? parsed.minProfit
          : DEFAULT_SETTINGS.minProfit,
      marketplaces: Array.isArray(parsed.marketplaces)
        ? parsed.marketplaces
            .filter(
              (m): m is MarketplacePreset =>
                Boolean(m) &&
                typeof m.id === 'string' &&
                typeof m.name === 'string' &&
                typeof m.feeRatePercent === 'number',
            )
            .map((m) => ({
              id: m.id,
              name: m.name,
              feeRatePercent: m.feeRatePercent,
            }))
        : structuredClone(DEFAULT_SETTINGS.marketplaces),
    }
  } catch {
    return structuredClone(DEFAULT_SETTINGS)
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}

/** ログイン必須・クラウド専用化のため端末キャッシュを破棄 */
export function clearLocalData(): void {
  localStorage.removeItem(ITEMS_KEY)
  localStorage.removeItem(SETTINGS_KEY)
}

export function createMarketplaceId(): string {
  return createId()
}

/** 過去入力からユニークな候補を抽出 */
export function uniqueSorted(values: string[]): string[] {
  const set = new Set(
    values
      .map((v) => v.trim())
      .filter(Boolean),
  )
  return [...set].sort((a, b) => a.localeCompare(b, 'ja'))
}
