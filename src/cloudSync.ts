/**
 * Firestore 同期は REST API を正とする。
 * SDK の setDoc/onSnapshot は環境によってハング・未到達になり、
 * 「画面上は保存されたがリロードで戻る」症状の原因になるため使わない。
 */
import { getFirebaseAuth, getFirebaseProjectId } from './firebase'
import { clearLocalData, loadItems, loadSettings } from './storage'
import { DEFAULT_SETTINGS, normalizeItem, type AppSettings, type Item } from './types'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function ensureAuthToken(): Promise<string> {
  const user = getFirebaseAuth().currentUser
  if (!user) throw new Error('ログイン状態を確認できませんでした')
  return user.getIdToken(true)
}

function formatSyncError(err: unknown): Error {
  const projectId = getFirebaseProjectId()
  const raw = err instanceof Error ? err.message : String(err)
  const code =
    err && typeof err === 'object' && 'code' in err ? String((err as { code?: string }).code) : ''

  if (code === 'permission-denied' || /permission|insufficient/i.test(raw)) {
    return new Error(
      'Firestore の権限エラーです。コンソールのルールを公開済みか確認してください。',
    )
  }
  if (code === 'not-found' || /does not exist|not contain an active/i.test(raw)) {
    return new Error(
      `Firestore データベースが見つかりません（project: ${projectId}）。コンソールで Firestore を作成してください。`,
    )
  }
  if (/offline|Failed to fetch|NetworkError/i.test(raw)) {
    return new Error(
      'クラウドに接続できませんでした。Wi-Fi を確認し、再読み込みしてください。',
    )
  }
  return err instanceof Error ? err : new Error(raw)
}

function toFirestoreValue(value: unknown): Record<string, unknown> {
  if (value === null) return { nullValue: null }
  if (typeof value === 'string') return { stringValue: value }
  if (typeof value === 'boolean') return { booleanValue: value }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return { doubleValue: 0 }
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value }
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map((v) => toFirestoreValue(v)) } }
  }
  if (typeof value === 'object') {
    const fields: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue
      fields[k] = toFirestoreValue(v)
    }
    return { mapValue: { fields } }
  }
  return { stringValue: String(value) }
}

function fromFirestoreValue(value: Record<string, unknown>): unknown {
  if ('stringValue' in value) return value.stringValue
  if ('integerValue' in value) return Number(value.integerValue)
  if ('doubleValue' in value) return value.doubleValue
  if ('booleanValue' in value) return value.booleanValue
  if ('nullValue' in value) return null
  if ('arrayValue' in value) {
    const values = (value.arrayValue as { values?: Record<string, unknown>[] })?.values ?? []
    return values.map((v) => fromFirestoreValue(v))
  }
  if ('mapValue' in value) {
    const fields =
      ((value.mapValue as { fields?: Record<string, Record<string, unknown>> })?.fields) ?? {}
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(fields)) {
      out[k] = fromFirestoreValue(v)
    }
    return out
  }
  return null
}

function docUrl(docPath: string): string {
  const projectId = getFirebaseProjectId()
  return (
    `https://firestore.googleapis.com/v1/projects/${projectId}` +
    `/databases/(default)/documents/${docPath}`
  )
}

async function restUpsertDocument(
  docPath: string,
  data: Record<string, unknown>,
  token: string,
): Promise<void> {
  const fields: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue
    fields[k] = toFirestoreValue(v)
  }
  const fieldPaths = Object.keys(fields)
  if (fieldPaths.length === 0) {
    throw new Error('保存するデータが空です')
  }

  const mask = fieldPaths
    .map((path) => `updateMask.fieldPaths=${encodeURIComponent(path)}`)
    .join('&')
  const url = `${docUrl(docPath)}?${mask}`

  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), 20000)

  let res: Response
  try {
    res = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields }),
      signal: controller.signal,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('クラウド書き込みがタイムアウトしました。再試行してください。')
    }
    throw err
  } finally {
    window.clearTimeout(timer)
  }

  if (!res.ok) {
    const body = await res.text()
    if (/PERMISSION_DENIED|permission/i.test(body)) {
      throw new Error(
        'Firestore の権限エラーです。コンソールのルールを公開済みか確認してください。',
      )
    }
    throw new Error(`クラウド書き込みエラー (${res.status}): ${body.slice(0, 180)}`)
  }
}

async function restDeleteDocument(docPath: string, token: string): Promise<void> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), 20000)
  let res: Response
  try {
    res = await fetch(docUrl(docPath), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('クラウド削除がタイムアウトしました。再試行してください。')
    }
    throw err
  } finally {
    window.clearTimeout(timer)
  }
  if (!res.ok && res.status !== 404) {
    throw new Error(`クラウド削除エラー (${res.status})`)
  }
}

async function restGetDocument(
  docPath: string,
  token: string,
): Promise<Record<string, unknown> | null> {
  const res = await fetch(docUrl(docPath), {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 404) return null
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`クラウド読み取りエラー (${res.status}): ${body.slice(0, 120)}`)
  }
  const data = (await res.json()) as {
    fields?: Record<string, Record<string, unknown>>
  }
  const raw: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data.fields ?? {})) {
    raw[key] = fromFirestoreValue(value)
  }
  return raw
}

async function restListItems(uid: string, token: string): Promise<Item[]> {
  const projectId = getFirebaseProjectId()
  const url =
    `https://firestore.googleapis.com/v1/projects/${projectId}` +
    `/databases/(default)/documents/users/${uid}/items?pageSize=300`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 404) return []
  if (!res.ok) {
    const body = await res.text()
    if (/PERMISSION_DENIED|permission/i.test(body)) {
      throw new Error(
        'Firestore の権限エラーです。コンソールのルールを公開済みか確認してください。',
      )
    }
    throw new Error(`クラウド接続エラー (${res.status})`)
  }
  const data = (await res.json()) as {
    documents?: { name?: string; fields?: Record<string, Record<string, unknown>> }[]
  }
  const items: Item[] = []
  for (const document of data.documents ?? []) {
    const id = document.name?.split('/').pop()
    if (!id) continue
    const raw: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(document.fields ?? {})) {
      raw[key] = fromFirestoreValue(value)
    }
    items.push(normalizeItem({ ...raw, id } as Partial<Item> & { id: string }))
  }
  return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

async function touchMeta(uid: string, token: string, itemCount: number): Promise<void> {
  await restUpsertDocument(
    `users/${uid}/meta/sync`,
    {
      initializedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      itemCount,
    },
    token,
  )
}

function itemToPlain(item: Item): Record<string, unknown> {
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
    memo: item.memo,
    marketplace: item.marketplace,
    feeRatePercent: item.feeRatePercent,
    feeDiscountPercent: item.feeDiscountPercent,
    saleShipping: item.saleShipping,
    couponAmount: item.couponAmount,
    salePrice: item.salePrice,
    soldDate: item.soldDate,
    status: item.status,
    pointsNote: item.pointsNote,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }
}

function settingsToPlain(settings: AppSettings): Record<string, unknown> {
  return {
    minProfit: settings.minProfit,
    marketplaces: settings.marketplaces.map((m) => ({
      id: m.id,
      name: m.name,
      feeRatePercent: m.feeRatePercent,
    })),
  }
}

/** 初回: クラウド空なら旧ローカルを取り込み、その後ローカル破棄 */
export async function ensureCloudInitialized(uid: string): Promise<void> {
  try {
    const token = await ensureAuthToken()
    await sleep(100)

    const cloudItems = await restListItems(uid, token)
    let settingsRaw = await restGetDocument(`users/${uid}/settings/app`, token)

    if (cloudItems.length === 0) {
      const legacyItems = loadItems()
      for (const item of legacyItems) {
        await restUpsertDocument(
          `users/${uid}/items/${item.id}`,
          itemToPlain(item),
          token,
        )
      }
    }

    if (!settingsRaw) {
      const legacySettings = loadSettings()
      await restUpsertDocument(
        `users/${uid}/settings/app`,
        settingsToPlain(legacySettings),
        token,
      )
    }

    const finalItems = await restListItems(uid, token)
    await touchMeta(uid, token, finalItems.length)
    clearLocalData()
  } catch (err) {
    throw formatSyncError(err)
  }
}

export async function fetchItems(uid: string): Promise<Item[]> {
  try {
    const token = await ensureAuthToken()
    return await restListItems(uid, token)
  } catch (err) {
    throw formatSyncError(err)
  }
}

export async function fetchSettings(uid: string): Promise<AppSettings> {
  try {
    const token = await ensureAuthToken()
    const raw = await restGetDocument(`users/${uid}/settings/app`, token)
    if (!raw) return structuredClone(DEFAULT_SETTINGS)
    return {
      minProfit:
        typeof raw.minProfit === 'number' && Number.isFinite(raw.minProfit)
          ? raw.minProfit
          : DEFAULT_SETTINGS.minProfit,
      marketplaces: Array.isArray(raw.marketplaces)
        ? (raw.marketplaces as AppSettings['marketplaces']).filter(
            (m) =>
              Boolean(m) &&
              typeof m.id === 'string' &&
              typeof m.name === 'string' &&
              typeof m.feeRatePercent === 'number',
          )
        : structuredClone(DEFAULT_SETTINGS.marketplaces),
    }
  } catch (err) {
    throw formatSyncError(err)
  }
}

export async function upsertItemCloud(uid: string, item: Item): Promise<void> {
  try {
    const token = await ensureAuthToken()
    await restUpsertDocument(`users/${uid}/items/${item.id}`, itemToPlain(item), token)

    // 読み戻して書き込み成功を確認
    const verify = await restGetDocument(`users/${uid}/items/${item.id}`, token)
    if (!verify) {
      throw new Error('保存を確認できませんでした（書き込み未反映）')
    }
    if (String(verify.updatedAt ?? '') !== item.updatedAt) {
      throw new Error('保存を確認できませんでした（内容が一致しません）')
    }

    const items = await restListItems(uid, token)
    await touchMeta(uid, token, items.length)
  } catch (err) {
    throw formatSyncError(err)
  }
}

export async function deleteItemCloud(uid: string, id: string): Promise<void> {
  try {
    const token = await ensureAuthToken()
    await restDeleteDocument(`users/${uid}/items/${id}`, token)
    const items = await restListItems(uid, token)
    await touchMeta(uid, token, items.length)
  } catch (err) {
    throw formatSyncError(err)
  }
}

export async function saveSettingsCloud(uid: string, settings: AppSettings): Promise<void> {
  try {
    const token = await ensureAuthToken()
    await restUpsertDocument(`users/${uid}/settings/app`, settingsToPlain(settings), token)

    const verify = await restGetDocument(`users/${uid}/settings/app`, token)
    if (!verify) {
      throw new Error('設定の保存を確認できませんでした')
    }
    if (Number(verify.minProfit) !== settings.minProfit) {
      throw new Error('設定の保存を確認できませんでした（最低利益が一致しません）')
    }
  } catch (err) {
    throw formatSyncError(err)
  }
}
