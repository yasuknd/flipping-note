import { initializeApp, type FirebaseApp } from 'firebase/app'
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  indexedDBLocalPersistence,
  initializeAuth,
  getAuth,
  type Auth,
} from 'firebase/auth'
import {
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  type Firestore,
} from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
}

export function isFirebaseConfigured(): boolean {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.authDomain &&
      firebaseConfig.projectId &&
      firebaseConfig.appId,
  )
}

let app: FirebaseApp | null = null
let auth: Auth | null = null
let db: Firestore | null = null

function getApp(): FirebaseApp {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase is not configured')
  }
  if (!app) {
    app = initializeApp(firebaseConfig)
  }
  return app
}

export function getFirebaseAuth(): Auth {
  if (!auth) {
    const firebaseApp = getApp()
    try {
      // Safari / iOS では getAuth() だとリダイレクト復帰が失敗しやすい
      auth = initializeAuth(firebaseApp, {
        persistence: indexedDBLocalPersistence,
        popupRedirectResolver: browserPopupRedirectResolver,
      })
    } catch {
      try {
        auth = initializeAuth(firebaseApp, {
          persistence: browserLocalPersistence,
          popupRedirectResolver: browserPopupRedirectResolver,
        })
      } catch {
        auth = getAuth(firebaseApp)
      }
    }
  }
  return auth
}

export function getFirebaseDb(): Firestore {
  if (!db) {
    // persistentLocalCache は Safari/iOS で誤って offline 扱いになることがある。
    // 端末キャッシュは localStorage 側で持つので、Firestore はメモリのみにする。
    try {
      db = initializeFirestore(getApp(), { localCache: memoryLocalCache() })
    } catch {
      db = getFirestore(getApp())
    }
  }
  return db
}
