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

/** Firestore REST: SDK の WebChannel が offline になる場合のフォールバック */
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

async function uploadLocalDataRest(uid: string, token: string): Promise<void> {
  const localItems = loadItems()
  const localSettings = loadSettings()

  for (const item of localItems) {
    await restUpsertDocument(`users/${uid}/items/${item.id}`, { ...item }, token)
  }
  await restUpsertDocument(`users/${uid}/settings/app`, { ...localSettings }, token)
  await restUpsertDocument(`users/${uid}/meta/sync`, {
    initializedAt: new Date().toISOString(),
    itemCount: localItems.length,
  }, token)
}

/** onSnapshot でサーバー応答を待ち、meta の有無を返す */
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
    itemCount: localItems.length,
  })
  await batch.commit()
}

async function restListItemIds(uid: string, token: string): Promise<Set<string>> {
  const projectId = getFirebaseProjectId()
  const url =
    `https://firestore.googleapis.com/v1/projects/${projectId}` +
    `/databases/(default)/documents/users/${uid}/items?pageSize=300`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 404) return new Set()
  if (!res.ok) return new Set()
  const data = (await res.json()) as { documents?: { name?: string }[] }
  const ids = new Set<string>()
  for (const doc of data.documents ?? []) {
    const name = doc.name ?? ''
    const id = name.split('/').pop()
    if (id) ids.add(id)
  }
  return ids
}

/**
 * 端末に商品があるのにクラウドが空／不足している場合にアップロードする。
 * （空端末で初期化して itemCount:0 になったケースの復旧用）
 */
export async function reconcileLocalItemsToCloud(uid: string): Promise<number> {
  const localItems = loadItems()
  if (localItems.length === 0) return 0

  const token = await ensureAuthToken()
  const cloudIds = await restListItemIds(uid, token)
  const toUpload =
    cloudIds.size === 0
      ? localItems
      : localItems.filter((item) => !cloudIds.has(item.id))

  if (toUpload.length === 0) return 0

  for (const item of toUpload) {
    await restUpsertDocument(`users/${uid}/items/${item.id}`, { ...item }, token)
  }

  const nextCount = cloudIds.size === 0 ? localItems.length : cloudIds.size + toUpload.length
  await restUpsertDocument(
    `users/${uid}/meta/sync`,
    {
      initializedAt: new Date().toISOString(),
      itemCount: nextCount,
      reconciledAt: new Date().toISOString(),
    },
    token,
  )

  // 設定も端末側に実データがあれば上書き同期（デフォルトだけがクラウドにあるケース）
  const localSettings = loadSettings()
  await restUpsertDocument(`users/${uid}/settings/app`, { ...localSettings }, token)

  return toUpload.length
}

/** クラウド未初期化なら端末の localStorage をアップロードする */
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
      if (!exists) {
        await uploadLocalDataRest(uid, token)
        await reconcileLocalItemsToCloud(uid)
        return
      }
    }

    if (!exists) {
      try {
        await uploadLocalDataSdk(uid)
      } catch {
        const freshToken = await ensureAuthToken()
        await uploadLocalDataRest(uid, freshToken)
      }
    }

    // meta があっても商品が未アップロードならここで救出
    await reconcileLocalItemsToCloud(uid)
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
}

export async function deleteItemCloud(uid: string, id: string): Promise<void> {
  try {
    await deleteDoc(itemDoc(uid, id))
  } catch {
    const token = await ensureAuthToken()
    const projectId = getFirebaseProjectId()
    const url =
      `https://firestore.googleapis.com/v1/projects/${projectId}` +
      `/databases/(default)/documents/users/${uid}/items/${id}`
    const res = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok && res.status !== 404) {
      throw new Error(`クラウド削除エラー (${res.status})`)
    }
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
      if (snap.metadata.fromCache && snap.empty) return

      const items = snap.docs
        .map((d) => normalizeItem({ ...(d.data() as Partial<Item>), id: d.id }))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

      // クラウド空・端末にデータあり → 上書きせずアップロードして端末表示を維持
      if (items.length === 0) {
        const local = loadItems()
        if (local.length > 0) {
          void reconcileLocalItemsToCloud(uid).catch(() => {
            /* 次回再同期で再試行 */
          })
          onChange(local)
          return
        }
      }

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
