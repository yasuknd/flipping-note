import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from './AuthContext'
import { deleteItemCloud, fetchItems, upsertItemCloud } from './cloudSync'
import type { Item, ItemInput } from './types'
import { deleteItem, upsertItem } from './storage'

interface ItemsContextValue {
  items: Item[]
  cloudSyncing: boolean
  save: (id: string | null, input: ItemInput) => Promise<Item>
  remove: (id: string) => Promise<void>
}

const ItemsContext = createContext<ItemsContextValue | null>(null)

export function ItemsProvider({ children }: { children: ReactNode }) {
  const { user, syncReady } = useAuth()
  const [items, setItems] = useState<Item[]>([])
  const [cloudSyncing, setCloudSyncing] = useState(false)
  const pendingWrites = useRef(0)

  useEffect(() => {
    if (!syncReady || !user) {
      setItems([])
      setCloudSyncing(false)
      return
    }

    let cancelled = false
    setCloudSyncing(true)

    const refresh = async () => {
      if (pendingWrites.current > 0) return
      try {
        const next = await fetchItems(user.uid)
        if (cancelled || pendingWrites.current > 0) return
        setItems(next)
      } finally {
        if (!cancelled) setCloudSyncing(false)
      }
    }

    void refresh()

    const onForeground = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    window.addEventListener('focus', onForeground)
    document.addEventListener('visibilitychange', onForeground)
    const timer = window.setInterval(() => void refresh(), 15000)

    return () => {
      cancelled = true
      window.removeEventListener('focus', onForeground)
      document.removeEventListener('visibilitychange', onForeground)
      window.clearInterval(timer)
    }
  }, [user, syncReady])

  const save = useCallback(
    async (id: string | null, input: ItemInput): Promise<Item> => {
      if (!user) throw new Error('ログインが必要です')

      let saved!: Item
      setItems((prev) => {
        const next = upsertItem(prev, id, input)
        saved = id ? next.find((i) => i.id === id)! : next[0]
        return next
      })

      pendingWrites.current += 1
      try {
        await upsertItemCloud(user.uid, saved)
        return saved
      } catch (err) {
        try {
          const latest = await fetchItems(user.uid)
          setItems(latest)
        } catch {
          /* ignore */
        }
        throw err
      } finally {
        pendingWrites.current = Math.max(0, pendingWrites.current - 1)
      }
    },
    [user],
  )

  const remove = useCallback(
    async (id: string) => {
      if (!user) throw new Error('ログインが必要です')

      setItems((prev) => deleteItem(prev, id))
      pendingWrites.current += 1
      try {
        await deleteItemCloud(user.uid, id)
      } catch (err) {
        try {
          const latest = await fetchItems(user.uid)
          setItems(latest)
        } catch {
          /* ignore */
        }
        throw err
      } finally {
        pendingWrites.current = Math.max(0, pendingWrites.current - 1)
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
