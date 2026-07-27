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
import { fetchSettings, saveSettingsCloud, subscribeSettings } from './cloudSync'
import { DEFAULT_SETTINGS, type AppSettings, type MarketplacePreset } from './types'
import { createMarketplaceId } from './storage'

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

    void fetchSettings(user.uid)
      .then((next) => {
        if (cancelled || pendingWrites.current > 0) return
        setSettings(next)
      })
      .catch(() => {
        /* ignore */
      })

    const unsub = subscribeSettings(user.uid, (next) => {
      if (cancelled || pendingWrites.current > 0) return
      setSettings(next)
    })

    const onForeground = () => {
      if (document.visibilityState !== 'visible') return
      if (pendingWrites.current > 0) return
      void fetchSettings(user.uid)
        .then((next) => {
          if (cancelled || pendingWrites.current > 0) return
          setSettings(next)
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

  const commit = useCallback(
    async (updater: (prev: AppSettings) => AppSettings) => {
      if (!user) return

      let next!: AppSettings
      setSettings((prev) => {
        next = updater(prev)
        return next
      })

      pendingWrites.current += 1
      try {
        await saveSettingsCloud(user.uid, next)
      } catch (err) {
        const latest = await fetchSettings(user.uid)
        setSettings(latest)
        throw err
      } finally {
        pendingWrites.current = Math.max(0, pendingWrites.current - 1)
      }
    },
    [user],
  )

  const setMinProfit = useCallback(
    (value: number) => {
      void commit((prev) => ({ ...prev, minProfit: Math.max(0, value) }))
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
      void commit((prev) => ({ ...prev, marketplaces: [...prev.marketplaces, next] }))
    },
    [commit],
  )

  const updateMarketplace = useCallback(
    (id: string, name: string, feeRatePercent: number) => {
      const trimmed = name.trim()
      if (!trimmed) return
      void commit((prev) => ({
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
      void commit((prev) => ({
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
