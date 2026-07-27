import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Item, ItemInput } from './types'
import { deleteItem, loadItems, saveItems, upsertItem } from './storage'

interface ItemsContextValue {
  items: Item[]
  save: (id: string | null, input: ItemInput) => Item
  remove: (id: string) => void
}

const ItemsContext = createContext<ItemsContextValue | null>(null)

export function ItemsProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>(() => loadItems())

  const save = useCallback((id: string | null, input: ItemInput): Item => {
    const prev = loadItems()
    const next = upsertItem(prev, id, input)
    saveItems(next)
    setItems(next)
    return id ? next.find((i) => i.id === id)! : next[0]
  }, [])

  const remove = useCallback((id: string) => {
    setItems((prev) => {
      const next = deleteItem(prev, id)
      saveItems(next)
      return next
    })
  }, [])

  const value = useMemo(() => ({ items, save, remove }), [items, save, remove])

  return <ItemsContext.Provider value={value}>{children}</ItemsContext.Provider>
}

export function useItems() {
  const ctx = useContext(ItemsContext)
  if (!ctx) throw new Error('useItems must be used within ItemsProvider')
  return ctx
}
