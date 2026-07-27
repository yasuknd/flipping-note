import {
  collection,
  deleteDoc,
  doc,
  enableNetwork,
  onSnapshot,
  setDoc,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore'
import { getFirebaseAuth, getFirebaseDb, getFirebaseProjectId } from './firebase'
import { loadItems, loadSettings, saveItems, saveSettings } from './storage'
import { normalizeItem, type AppSettings, type Item } from './types'

function itemsCol(uid: string) {
  return collection(getFirebaseDb(), 'users', uid, 'items')
}

function itemDoc(uid: string, id: string) {
  return doc(getFirebaseDb(), 'users', uid, 'items', id)
}

function settingsDoc(uid: string) {
  return doc(getFirebaseDb(), 'users', uid, 'settings', 'app')
}

function syncMetaDoc(uid: string) {
  return doc(getFirebaseDb(), 'users', uid, 'meta', 'sync')
}

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
  if (/offline/i.test(raw)) {
    return new Error(
      'クラウドに接続できませんでした。Wi-Fi を確認し、設定の「再同期」を押すかページを再読み込みしてください。',
    )
  }
  return err instanceof Error ? err : new Error(raw)
}

function toFirestoreValue(value: unknown): Record<string, unknown> {
  if (value === null) return { nullValue: null }
  if (typeof value === 'string') return { stringValue: value }
  if (typeof value === 'boolean') return { booleanValue: value }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value }
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map((v) => toFirestoreValue(v)) } }
  }
  if (typeof value === 'object') {
    const fields: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
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

async function restUpsertDocument(
  docPath: string,
  data: Record<string, unknown>,
  token: string,
): Promise<void> {
  const projectId = getFirebaseProjectId()
  const url =
    `https://firestore.googleapis.com/v1/projects/${projectId}` +
    `/databases/(default)/documents/${docPath}`
  const fields: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) {
    fields[k] = toFirestoreValue(v)
  }
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields }),
  })
  if (!res.ok) {
    const body = await res.text()
    if (/PERMISSION_DENIED|permission/i.test(body)) {
      throw new Error(
        'Firestore の権限エラーです。コンソールのルールを公開済みか確認してください。',
      )
    }
    throw new Error(`クラウド書き込みエラー (${res.status})`)
  }
}

async function restDeleteDocument(docPath: string, token: string): Promise<void> {
  const projectId = getFirebaseProjectId()
  const url =
    `https://firestore.googleapis.com/v1/projects/${projectId}` +
    `/databases/(default)/documents/${docPath}`
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok && res.status !== 404) {
    throw new Error(`クラウド削除エラー (${res.status})`)
  }
}

async function restGetMetaExists(uid: string, token: string): Promise<boolean> {
  const projectId = getFirebaseProjectId()
  const url =
    `https://firestore.googleapis.com/v1/projects/${projectId}` +
    `/databases/(default)/documents/users/${uid}/meta/sync`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 404) return false
  if (!res.ok) {
    const body = await res.text()
    if (/PERMISSION_DENIED|permission/i.test(body)) {
      throw new Error(
        'Firestore の権限エラーです。コンソールのルールを公開済みか確認してください。',
      )
    }
    throw new Error(`クラウド接続エラー (${res.status})`)
  }
  return true
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

async function restGetSettings(uid: string, token: string): Promise<AppSettings | null> {
  const projectId = getFirebaseProjectId()
  const url =
    `https://firestore.googleapis.com/v1/projects/${projectId}` +
    `/databases/(default)/documents/users/${uid}/settings/app`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 404) return null
  if (!res.ok) return null
  const data = (await res.json()) as {
    fields?: Record<string, Record<string, unknown>>
  }
  const raw: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data.fields ?? {})) {
    raw[key] = fromFirestoreValue(value)
  }
  return {
    minProfit:
      typeof raw.minProfit === 'number' && Number.isFinite(raw.minProfit)
        ? raw.minProfit
        : loadSettings().minProfit,
    marketplaces: Array.isArray(raw.marketplaces)
      ? (raw.marketplaces as AppSettings['marketplaces']).filter(
          (m) =>
            Boolean(m) &&
            typeof m.id === 'string' &&
            typeof m.name === 'string' &&
            typeof m.feeRatePercent === 'number',
        )
      : loadSettings().marketplaces,
  }
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

async function uploadLocalDataRest(uid: string, token: string): Promise<void> {
  const localItems = loadItems()
  const localSettings = loadSettings()
  for (const item of localItems) {
    await restUpsertDocument(`users/${uid}/items/${item.id}`, { ...item }, token)
  }
  await restUpsertDocument(`users/${uid}/settings/app`, { ...localSettings }, token)
  await touchMeta(uid, token, localItems.length)
}

function waitForMetaExists(uid: string, timeoutMs = 12000): Promise<boolean> {
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      unsub()
      fn()
    }

    const timer = setTimeout(() => {
      finish(() => reject(new Error('offline')))
    }, timeoutMs)

    const unsub = onSnapshot(
      syncMetaDoc(uid),
      { includeMetadataChanges: true },
      (snap) => {
        if (snap.metadata.fromCache) return
        finish(() => resolve(snap.exists()))
      },
      (err) => {
        finish(() => reject(err))
      },
    )
  })
}

async function uploadLocalDataSdk(uid: string): Promise<void> {
  const localItems = loadItems()
  const localSettings = loadSettings()
  const db = getFirebaseDb()
  await enableNetwork(db)
  const batch = writeBatch(db)
  for (const item of localItems) {
    batch.set(itemDoc(uid, item.id), item)
  }
  batch.set(settingsDoc(uid), localSettings)
  batch.set(syncMetaDoc(uid), {
    initializedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    itemCount: localItems.length,
  })
  await batch.commit()
}

/**
 * クラウドが空で端末にデータがあるときだけ初期投入する。
 * ※ クラウドに1件でもある場合は投入しない（他端末の削除を戻さないため）
 */
async function seedCloudFromLocalIfEmpty(uid: string, token: string): Promise<void> {
  const cloudItems = await restListItems(uid, token)
  if (cloudItems.length > 0) return

  const localItems = loadItems()
  if (localItems.length === 0) {
    if (!(await restGetMetaExists(uid, token))) {
      await restUpsertDocument(`users/${uid}/settings/app`, { ...loadSettings() }, token)
      await touchMeta(uid, token, 0)
    }
    return
  }

  await uploadLocalDataRest(uid, token)
}

/** クラウドから商品一覧を取得して localStorage にも反映 */
export async function pullItemsFromCloud(uid: string): Promise<Item[]> {
  const token = await ensureAuthToken()
  const items = await restListItems(uid, token)
  saveItems(items)
  return items
}

/** クラウドから設定を取得して localStorage にも反映 */
export async function pullSettingsFromCloud(uid: string): Promise<AppSettings | null> {
  const token = await ensureAuthToken()
  const settings = await restGetSettings(uid, token)
  if (settings) saveSettings(settings)
  return settings
}

/** ログイン後の初期化: meta 確認 → 空クラウドなら端末データを投入 */
export async function ensureCloudInitialized(uid: string): Promise<void> {
  try {
    const token = await ensureAuthToken()
    const db = getFirebaseDb()
    await enableNetwork(db)
    await sleep(200)

    let exists = false
    try {
      exists = await waitForMetaExists(uid)
    } catch {
      exists = await restGetMetaExists(uid, token)
    }

    if (!exists) {
      try {
        await uploadLocalDataSdk(uid)
      } catch {
        const freshToken = await ensureAuthToken()
        await uploadLocalDataRest(uid, freshToken)
      }
    }

    // 空クラウドへの救出（削除取り消しを起こさないよう「完全に空」のときだけ）
    await seedCloudFromLocalIfEmpty(uid, await ensureAuthToken())
  } catch (err) {
    throw formatSyncError(err)
  }
}

export async function upsertItemCloud(uid: string, item: Item): Promise<void> {
  try {
    await setDoc(itemDoc(uid, item.id), item)
  } catch {
    const token = await ensureAuthToken()
    await restUpsertDocument(`users/${uid}/items/${item.id}`, { ...item }, token)
  }
  try {
    const token = await ensureAuthToken()
    const items = await restListItems(uid, token)
    await touchMeta(uid, token, items.length)
  } catch {
    /* meta 更新失敗は本体同期を止めない */
  }
}

export async function deleteItemCloud(uid: string, id: string): Promise<void> {
  try {
    await deleteDoc(itemDoc(uid, id))
  } catch {
    const token = await ensureAuthToken()
    await restDeleteDocument(`users/${uid}/items/${id}`, token)
  }
  try {
    const token = await ensureAuthToken()
    const items = await restListItems(uid, token)
    await touchMeta(uid, token, items.length)
  } catch {
    /* meta 更新失敗は本体同期を止めない */
  }
}

export async function saveSettingsCloud(uid: string, settings: AppSettings): Promise<void> {
  try {
    await setDoc(settingsDoc(uid), settings)
  } catch {
    const token = await ensureAuthToken()
    await restUpsertDocument(`users/${uid}/settings/app`, { ...settings }, token)
  }
}

export function subscribeItems(
  uid: string,
  onChange: (items: Item[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    itemsCol(uid),
    (snap) => {
      // 初回キャッシュの空振りだけ無視。サーバー結果（空含む）はクラウドを正とする
      if (snap.metadata.fromCache && snap.empty) return

      const items = snap.docs
        .map((d) => normalizeItem({ ...(d.data() as Partial<Item>), id: d.id }))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      saveItems(items)
      onChange(items)
    },
    (error) => onError?.(formatSyncError(error)),
  )
}

export function subscribeSettings(
  uid: string,
  onChange: (settings: AppSettings) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    settingsDoc(uid),
    (snap) => {
      if (!snap.exists()) return
      if (snap.metadata.fromCache) return
      const data = snap.data() as Partial<AppSettings>
      const settings: AppSettings = {
        minProfit:
          typeof data.minProfit === 'number' && Number.isFinite(data.minProfit)
            ? data.minProfit
            : loadSettings().minProfit,
        marketplaces: Array.isArray(data.marketplaces)
          ? data.marketplaces.filter(
              (m): m is AppSettings['marketplaces'][number] =>
                Boolean(m) &&
                typeof m.id === 'string' &&
                typeof m.name === 'string' &&
                typeof m.feeRatePercent === 'number',
            )
          : loadSettings().marketplaces,
      }
      saveSettings(settings)
      onChange(settings)
    },
    (error) => onError?.(formatSyncError(error)),
  )
}
