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
import { deleteItemCloud, subscribeItems, upsertItemCloud } from './cloudSync'
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

    setCloudSyncing(true)
    const unsub = subscribeItems(
      user.uid,
      (next) => {
        setItems(next)
        setCloudSyncing(false)
      },
      () => {
        setCloudSyncing(false)
      },
    )
    return unsub
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
