import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from './AuthContext'
import {
  deleteItemCloud,
  pullItemsFromCloud,
  subscribeItems,
  upsertItemCloud,
} from './cloudSync'
import type { Item, ItemInput } from './types'
import { deleteItem, loadItems, saveItems, upsertItem } from './storage'

interface ItemsContextValue {
  items: Item[]
  cloudSyncing: boolean
  save: (id: string | null, input: ItemInput) => Promise<Item>
  remove: (id: string) => Promise<void>
}

const ItemsContext = createContext<ItemsContextValue | null>(null)

export function ItemsProvider({ children }: { children: ReactNode }) {
  const { user, syncReady } = useAuth()
  const [items, setItems] = useState<Item[]>(() => loadItems())
  const [cloudSyncing, setCloudSyncing] = useState(false)

  useEffect(() => {
    if (!syncReady) return

    if (!user) {
      setItems(loadItems())
      setCloudSyncing(false)
      return
    }

    let cancelled = false
    setCloudSyncing(true)

    const applyCloud = async () => {
      try {
        const next = await pullItemsFromCloud(user.uid)
        if (!cancelled) {
          setItems(next)
          setCloudSyncing(false)
        }
      } catch {
        if (!cancelled) setCloudSyncing(false)
      }
    }

    const unsub = subscribeItems(
      user.uid,
      (next) => {
        if (cancelled) return
        setItems(next)
        setCloudSyncing(false)
      },
      () => {
        if (!cancelled) setCloudSyncing(false)
      },
    )

    void applyCloud()

    const onForeground = () => {
      if (document.visibilityState === 'visible') void applyCloud()
    }
    window.addEventListener('focus', onForeground)
    document.addEventListener('visibilitychange', onForeground)
    const timer = window.setInterval(() => void applyCloud(), 20000)

    return () => {
      cancelled = true
      unsub()
      window.removeEventListener('focus', onForeground)
      document.removeEventListener('visibilitychange', onForeground)
      window.clearInterval(timer)
    }
  }, [user, syncReady])

  const save = useCallback(
    async (id: string | null, input: ItemInput): Promise<Item> => {
      let saved!: Item
      setItems((prev) => {
        const next = upsertItem(prev, id, input)
        saved = id ? next.find((i) => i.id === id)! : next[0]
        saveItems(next)
        return next
      })
      if (user) {
        await upsertItemCloud(user.uid, saved)
      }
      return saved
    },
    [user],
  )

  const remove = useCallback(
    async (id: string) => {
      setItems((prev) => {
        const next = deleteItem(prev, id)
        saveItems(next)
        return next
      })
      if (user) {
        await deleteItemCloud(user.uid, id)
      }
    },
    [user],
  )

  const value = useMemo(
    () => ({ items, cloudSyncing, save, remove }),
    [items, cloudSyncing, save, remove],
  )

  return <ItemsContext.Provider value={value}>{children}</ItemsContext.Provider>
}

export function useItems() {
  const ctx = useContext(ItemsContext)
  if (!ctx) throw new Error('useItems must be used within ItemsProvider')
  return ctx
}
