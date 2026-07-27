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
import {
  deleteItemCloud,
  fetchItems,
  subscribeItems,
  upsertItemCloud,
} from './cloudSync'
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

    void fetchItems(user.uid)
      .then((next) => {
        if (cancelled || pendingWrites.current > 0) return
        setItems(next)
        setCloudSyncing(false)
      })
      .catch(() => {
        if (!cancelled) setCloudSyncing(false)
      })

    const unsub = subscribeItems(
      user.uid,
      (next) => {
        if (cancelled || pendingWrites.current > 0) return
        setItems(next)
        setCloudSyncing(false)
      },
      () => {
        if (!cancelled) setCloudSyncing(false)
      },
    )

    const onForeground = () => {
      if (document.visibilityState !== 'visible') return
      if (pendingWrites.current > 0) return
      void fetchItems(user.uid)
        .then((next) => {
          if (cancelled || pendingWrites.current > 0) return
          setItems(next)
        })
        .catch(() => {
          /* ignore */
        })
    }
    window.addEventListener('focus', onForeground)
    document.addEventListener('visibilitychange', onForeground)

    return () => {
      cancelled = true
      unsub()
      window.removeEventListener('focus', onForeground)
      document.removeEventListener('visibilitychange', onForeground)
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
        // 失敗時はクラウドの最新で戻す
        const latest = await fetchItems(user.uid)
        setItems(latest)
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
        const latest = await fetchItems(user.uid)
        setItems(latest)
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
