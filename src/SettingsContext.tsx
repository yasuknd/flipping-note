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
import { saveSettingsCloud, subscribeSettings } from './cloudSync'
import type { AppSettings, MarketplacePreset } from './types'
import { createMarketplaceId, loadSettings, saveSettings } from './storage'

interface SettingsContextValue {
  settings: AppSettings
  setMinProfit: (value: number) => void
  addMarketplace: (name: string, feeRatePercent: number) => void
  updateMarketplace: (id: string, name: string, feeRatePercent: number) => void
  removeMarketplace: (id: string) => void
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { user, syncReady } = useAuth()
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings())

  useEffect(() => {
    if (!syncReady) return

    if (!user) {
      setSettings(loadSettings())
      return
    }

    const unsub = subscribeSettings(user.uid, setSettings)
    return unsub
  }, [user, syncReady])

  const commit = useCallback(
    (updater: (prev: AppSettings) => AppSettings) => {
      setSettings((prev) => {
        const next = updater(prev)
        saveSettings(next)
        if (user) {
          void saveSettingsCloud(user.uid, next)
        }
        return next
      })
    },
    [user],
  )

  const setMinProfit = useCallback(
    (value: number) => {
      commit((prev) => ({ ...prev, minProfit: Math.max(0, value) }))
    },
    [commit],
  )

  const addMarketplace = useCallback(
    (name: string, feeRatePercent: number) => {
      const trimmed = name.trim()
      if (!trimmed) return
      const next: MarketplacePreset = {
        id: createMarketplaceId(),
        name: trimmed,
        feeRatePercent,
      }
      commit((prev) => ({ ...prev, marketplaces: [...prev.marketplaces, next] }))
    },
    [commit],
  )

  const updateMarketplace = useCallback(
    (id: string, name: string, feeRatePercent: number) => {
      const trimmed = name.trim()
      if (!trimmed) return
      commit((prev) => ({
        ...prev,
        marketplaces: prev.marketplaces.map((m) =>
          m.id === id ? { ...m, name: trimmed, feeRatePercent } : m,
        ),
      }))
    },
    [commit],
  )

  const removeMarketplace = useCallback(
    (id: string) => {
      commit((prev) => ({
        ...prev,
        marketplaces: prev.marketplaces.filter((m) => m.id !== id),
      }))
    },
    [commit],
  )

  const value = useMemo(
    () => ({
      settings,
      setMinProfit,
      addMarketplace,
      updateMarketplace,
      removeMarketplace,
    }),
    [settings, setMinProfit, addMarketplace, updateMarketplace, removeMarketplace],
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider')
  return ctx
}
