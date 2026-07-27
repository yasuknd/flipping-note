import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore'
import { getFirebaseDb } from './firebase'
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

/** クラウド未初期化なら端末の localStorage をアップロードする */
export async function ensureCloudInitialized(uid: string): Promise<void> {
  const metaRef = syncMetaDoc(uid)
  const meta = await getDoc(metaRef)
  if (meta.exists()) return

  const localItems = loadItems()
  const localSettings = loadSettings()
  const db = getFirebaseDb()
  const batch = writeBatch(db)

  for (const item of localItems) {
    batch.set(itemDoc(uid, item.id), item)
  }
  batch.set(settingsDoc(uid), localSettings)
  batch.set(metaRef, {
    initializedAt: new Date().toISOString(),
    itemCount: localItems.length,
  })
  await batch.commit()
}

export async function upsertItemCloud(uid: string, item: Item): Promise<void> {
  await setDoc(itemDoc(uid, item.id), item)
}

export async function deleteItemCloud(uid: string, id: string): Promise<void> {
  await deleteDoc(itemDoc(uid, id))
}

export async function saveSettingsCloud(uid: string, settings: AppSettings): Promise<void> {
  await setDoc(settingsDoc(uid), settings)
}

export function subscribeItems(
  uid: string,
  onChange: (items: Item[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    itemsCol(uid),
    (snap) => {
      const items = snap.docs
        .map((d) => normalizeItem({ ...(d.data() as Partial<Item>), id: d.id }))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      saveItems(items)
      onChange(items)
    },
    (error) => onError?.(error),
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
    (error) => onError?.(error),
  )
}
