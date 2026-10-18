// Accounts and what they own.
//
// Sign-in is Google, through Firebase Authentication. What an account owns lives in
// Firestore at users/{uid} as { entitlements: ['pro'] or ['galaxy', 'song', …] }, written
// only by our server when a payment succeeds (see firestore.rules). The browser reads it
// to decide what to show; it can't grant itself anything.
//
// Firebase switches on when the site is built with the VITE_FIREBASE_* settings (see
// .env.example). Without them, sign-in says it's opening soon and nobody owns Pro.

const env = import.meta.env;
const CONFIG = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

let account = null; // { uid, name, email, picture, entitlements }
const listeners = new Set();
const changed = () => listeners.forEach((fn) => fn(account));

export const signInAvailable = () => Boolean(CONFIG.apiKey && CONFIG.projectId);
export const currentAccount = () => account;
export const onAccountChange = (fn) => (listeners.add(fn), () => listeners.delete(fn));

/** True when the signed-in account owns this world (or all of Pro). */
export function owns(item) {
  const e = account?.entitlements ?? [];
  return e.includes('pro') || e.includes(item);
}

// Firebase is large, so it loads on first use (sign-in, or a returning signed-in visitor).
let firebase = null;
async function load() {
  if (firebase) return firebase;
  const [{ initializeApp }, auth, store] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')]);
  const app = initializeApp(CONFIG);
  firebase = { auth, store, a: auth.getAuth(app), db: store.getFirestore(app) };
  // keep `account` in step with Firebase's session, and with the account's purchases
  let stopDoc = null;
  auth.onAuthStateChanged(firebase.a, (user) => {
    stopDoc?.();
    if (!user) {
      account = null;
      remember(false);
      return changed();
    }
    account = { uid: user.uid, name: user.displayName, email: user.email, picture: user.photoURL, entitlements: [] };
    remember(true);
    changed();
    stopDoc = store.onSnapshot(store.doc(firebase.db, 'users', user.uid), (snap) => {
      account = { ...account, entitlements: snap.data()?.entitlements ?? [] };
      changed();
    });
  });
  return firebase;
}

// Only bring Firebase in on page load for people who signed in before.
const KEY = 'signed-in';
function remember(on) {
  try {
    on ? localStorage.setItem(KEY, '1') : localStorage.removeItem(KEY);
  } catch {}
}
try {
  if (signInAvailable() && localStorage.getItem(KEY)) load();
} catch {}

/** Google sign-in in a popup. Resolves with the account, or rejects with a readable reason. */
export async function signInWithGoogle() {
  if (!signInAvailable()) throw new Error('setup');
  const { auth, a } = await load();
  try {
    const { user } = await auth.signInWithPopup(a, new auth.GoogleAuthProvider());
    account ||= { uid: user.uid, name: user.displayName, email: user.email, picture: user.photoURL, entitlements: [] };
  } catch (err) {
    if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') throw new Error('Sign-in was closed before it finished.');
    if (err.code === 'auth/popup-blocked') throw new Error('Your browser blocked the sign-in window. Allow pop-ups for this site and try again.');
    throw new Error('Google sign-in didn’t work this time. Please try again.');
  }
  return account;
}

export async function signOut() {
  if (!firebase) return;
  await firebase.auth.signOut(firebase.a);
}
