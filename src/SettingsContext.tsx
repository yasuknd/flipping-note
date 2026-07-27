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
import { fetchSettings, saveSettingsCloud } from './cloudSync'
import { DEFAULT_SETTINGS, type AppSettings, type MarketplacePreset } from './types'
import { createMarketplaceId } from './storage'

interface SettingsContextValue {
  settings: AppSettings
  setMinProfit: (value: number) => Promise<void>
  addMarketplace: (name: string, feeRatePercent: number) => Promise<void>
  updateMarketplace: (id: string, name: string, feeRatePercent: number) => Promise<void>
  removeMarketplace: (id: string) => Promise<void>
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { user, syncReady } = useAuth()
  const [settings, setSettings] = useState<AppSettings>(() =>
    structuredClone(DEFAULT_SETTINGS),
  )
  const pendingWrites = useRef(0)

  useEffect(() => {
    if (!syncReady || !user) {
      setSettings(structuredClone(DEFAULT_SETTINGS))
      return
    }

    let cancelled = false

    const refresh = async () => {
      if (pendingWrites.current > 0) return
      try {
        const next = await fetchSettings(user.uid)
        if (cancelled || pendingWrites.current > 0) return
        setSettings(next)
      } catch {
        /* ignore */
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

  const commit = useCallback(
    async (updater: (prev: AppSettings) => AppSettings) => {
      if (!user) throw new Error('ログインが必要です')

      let next!: AppSettings
      setSettings((prev) => {
        next = updater(prev)
        return next
      })

      pendingWrites.current += 1
      try {
        await saveSettingsCloud(user.uid, next)
      } catch (err) {
        try {
          const latest = await fetchSettings(user.uid)
          setSettings(latest)
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

  const setMinProfit = useCallback(
    async (value: number) => {
      await commit((prev) => ({ ...prev, minProfit: Math.max(0, value) }))
    },
    [commit],
  )

  const addMarketplace = useCallback(
    async (name: string, feeRatePercent: number) => {
      const trimmed = name.trim()
      if (!trimmed) return
      const next: MarketplacePreset = {
        id: createMarketplaceId(),
        name: trimmed,
        feeRatePercent,
      }
      await commit((prev) => ({ ...prev, marketplaces: [...prev.marketplaces, next] }))
    },
    [commit],
  )

  const updateMarketplace = useCallback(
    async (id: string, name: string, feeRatePercent: number) => {
      const trimmed = name.trim()
      if (!trimmed) return
      await commit((prev) => ({
        ...prev,
        marketplaces: prev.marketplaces.map((m) =>
          m.id === id ? { ...m, name: trimmed, feeRatePercent } : m,
        ),
      }))
    },
    [commit],
  )

  const removeMarketplace = useCallback(
    async (id: string) => {
      await commit((prev) => ({
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
