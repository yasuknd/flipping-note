import {
  GoogleAuthProvider,
  browserPopupRedirectResolver,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { ensureCloudInitialized } from './cloudSync'
import { getFirebaseAuth, isFirebaseConfigured } from './firebase'
import { clearLocalData } from './storage'

const REDIRECT_FLAG_KEY = 'fn-auth-redirect-pending'

interface AuthContextValue {
  configured: boolean
  ready: boolean
  user: User | null
  syncReady: boolean
  syncError: string | null
  authError: string | null
  clearAuthError: () => void
  retrySync: () => Promise<void>
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function isMobileBrowser(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

function authErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) return 'ログインに失敗しました'
  const code = 'code' in err ? String((err as { code?: string }).code) : ''
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return 'ログインがキャンセルされました'
  }
  if (code === 'auth/popup-blocked') {
    return 'ポップアップがブロックされました。もう一度お試しください'
  }
  if (code === 'auth/unauthorized-domain') {
    return 'このドメインは Firebase で許可されていません（yasuknd.github.io を追加してください）'
  }
  if (code === 'auth/network-request-failed') {
    return 'ネットワークエラーです。通信環境を確認してください'
  }
  return err.message || 'ログインに失敗しました'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isFirebaseConfigured()
  const [ready, setReady] = useState(!configured)
  const [user, setUser] = useState<User | null>(null)
  const [syncReady, setSyncReady] = useState(!configured)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)
  const [syncNonce, setSyncNonce] = useState(0)

  const clearAuthError = useCallback(() => setAuthError(null), [])

  const runCloudInit = useCallback(async (uid: string) => {
    setSyncReady(false)
    setSyncError(null)
    await ensureCloudInitialized(uid)
    setSyncReady(true)
  }, [])

  useEffect(() => {
    if (!configured) return

    const auth = getFirebaseAuth()
    let cancelled = false

    void (async () => {
      try {
        const result = await getRedirectResult(auth)
        if (cancelled) return
        if (result?.user) {
          sessionStorage.removeItem(REDIRECT_FLAG_KEY)
          setAuthError(null)
          return
        }
        if (sessionStorage.getItem(REDIRECT_FLAG_KEY) === '1' && !auth.currentUser) {
          sessionStorage.removeItem(REDIRECT_FLAG_KEY)
          setAuthError('ログインを完了できませんでした。もう一度お試しください。')
        }
      } catch (err) {
        if (cancelled) return
        sessionStorage.removeItem(REDIRECT_FLAG_KEY)
        setAuthError(authErrorMessage(err))
      }
    })()

    const unsub = onAuthStateChanged(auth, (next) => {
      if (cancelled) return
      setUser(next)
      setReady(true)
      if (next) {
        sessionStorage.removeItem(REDIRECT_FLAG_KEY)
        setAuthError(null)
      }
    })

    return () => {
      cancelled = true
      unsub()
    }
  }, [configured])

  useEffect(() => {
    if (!configured) {
      setSyncReady(true)
      return
    }
    if (!ready) return

    if (!user) {
      setSyncReady(true)
      setSyncError(null)
      return
    }

    let cancelled = false
    setSyncReady(false)
    setSyncError(null)

    void runCloudInit(user.uid)
      .then(() => {
        if (cancelled) return
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const message = err instanceof Error ? err.message : 'クラウド初期化に失敗しました'
        setSyncError(message)
        setSyncReady(true)
      })

    return () => {
      cancelled = true
    }
  }, [configured, ready, user, syncNonce, runCloudInit])

  const retrySync = useCallback(async () => {
    if (!user) return
    setSyncNonce((n) => n + 1)
  }, [user])

  const signInWithGoogle = useCallback(async () => {
    if (!configured) {
      throw new Error('Firebase が設定されていません')
    }
    setAuthError(null)
    const auth = getFirebaseAuth()
    const provider = new GoogleAuthProvider()
    provider.setCustomParameters({ prompt: 'select_account' })

    // ユーザー操作起点なら popup を優先（iPhone Safari でも成功しやすい）
    try {
      await signInWithPopup(auth, provider, browserPopupRedirectResolver)
      return
    } catch (popupErr) {
      const code =
        popupErr && typeof popupErr === 'object' && 'code' in popupErr
          ? String((popupErr as { code?: string }).code)
          : ''

      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        throw popupErr
      }

      if (
        isMobileBrowser() ||
        code === 'auth/popup-blocked' ||
        code === 'auth/operation-not-supported-in-this-environment'
      ) {
        sessionStorage.setItem(REDIRECT_FLAG_KEY, '1')
        await signInWithRedirect(auth, provider, browserPopupRedirectResolver)
        return
      }

      throw popupErr
    }
  }, [configured])

  const signOut = useCallback(async () => {
    if (!configured) return
    clearLocalData()
    await firebaseSignOut(getFirebaseAuth())
  }, [configured])

  const value = useMemo(
    () => ({
      configured,
      ready,
      user,
      syncReady,
      syncError,
      authError,
      clearAuthError,
      retrySync,
      signInWithGoogle,
      signOut,
    }),
    [
      configured,
      ready,
      user,
      syncReady,
      syncError,
      authError,
      clearAuthError,
      retrySync,
      signInWithGoogle,
      signOut,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
