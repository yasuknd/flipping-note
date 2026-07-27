import {
  GoogleAuthProvider,
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

interface AuthContextValue {
  configured: boolean
  ready: boolean
  user: User | null
  syncReady: boolean
  syncError: string | null
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function prefersRedirectSignIn(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  return (
    /iPhone|iPad|iPod|Android/i.test(ua) ||
    (/Safari/i.test(ua) && !/Chrome|CriOS|Edg/i.test(ua))
  )
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isFirebaseConfigured()
  const [ready, setReady] = useState(!configured)
  const [user, setUser] = useState<User | null>(null)
  const [syncReady, setSyncReady] = useState(!configured)
  const [syncError, setSyncError] = useState<string | null>(null)

  useEffect(() => {
    if (!configured) return

    const auth = getFirebaseAuth()
    let cancelled = false

    void getRedirectResult(auth).catch(() => {
      /* ignore: no redirect pending */
    })

    const unsub = onAuthStateChanged(auth, (next) => {
      if (cancelled) return
      setUser(next)
      setReady(true)
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

    void ensureCloudInitialized(user.uid)
      .then(() => {
        if (!cancelled) setSyncReady(true)
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
  }, [configured, ready, user])

  const signInWithGoogle = useCallback(async () => {
    if (!configured) {
      throw new Error('Firebase が設定されていません')
    }
    const auth = getFirebaseAuth()
    const provider = new GoogleAuthProvider()
    provider.setCustomParameters({ prompt: 'select_account' })

    if (prefersRedirectSignIn()) {
      await signInWithRedirect(auth, provider)
      return
    }

    try {
      await signInWithPopup(auth, provider)
    } catch {
      await signInWithRedirect(auth, provider)
    }
  }, [configured])

  const signOut = useCallback(async () => {
    if (!configured) return
    await firebaseSignOut(getFirebaseAuth())
  }, [configured])

  const value = useMemo(
    () => ({
      configured,
      ready,
      user,
      syncReady,
      syncError,
      signInWithGoogle,
      signOut,
    }),
    [configured, ready, user, syncReady, syncError, signInWithGoogle, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
