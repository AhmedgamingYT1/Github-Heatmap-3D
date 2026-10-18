// Accounts and what they own.
//
// Sign-in is Clerk (Google only, set in the Clerk dashboard). Clerk loads after the page
// so it never slows the first paint. Once someone is signed in we ask our own server
// (/api/me), which checks the Clerk session, keeps the person in our Neon database and
// says what they own. The browser only uses that to decide what to show; the server is
// where purchases are recorded and checked.

const KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || '';

let clerkPromise = null;
let account = null; // { id, name, email, picture, entitlements }
const listeners = new Set();
const changed = () => listeners.forEach((fn) => fn(account));

export const signInAvailable = () => Boolean(KEY);
export const currentAccount = () => account;
export const onAccountChange = (fn) => (listeners.add(fn), () => listeners.delete(fn));

/** True when the signed-in account owns this world (or all of Pro). */
export function owns(item) {
  const e = account?.entitlements ?? [];
  return e.includes('pro') || e.includes(item);
}

function loadClerk() {
  clerkPromise ||= (async () => {
    // Clerk's UI is bundled with the site rather than fetched from Clerk's CDN at run time
    const [{ Clerk }, { ui }] = await Promise.all([import('@clerk/clerk-js'), import('@clerk/ui')]);
    const clerk = new Clerk(KEY);
    await clerk.load({ ui: { ClerkUI: ui.ClerkUI }, appearance: { variables: { borderRadius: '14px' } } });
    clerk.addListener(({ user }) => sync(user));
    if (import.meta.env.DEV) window.__clerk = clerk; // for testing sign-in locally
    return clerk;
  })();
  return clerkPromise;
}

let syncedFor = '';
async function sync(user) {
  if (!user) {
    syncedFor = '';
    if (account) {
      account = null;
      changed();
    }
    return;
  }
  if (syncedFor === user.id) return;
  syncedFor = user.id;
  account = {
    id: user.id,
    name: user.fullName || user.firstName || '',
    email: user.primaryEmailAddress?.emailAddress || '',
    picture: user.imageUrl,
    entitlements: [],
  };
  changed();
  try {
    const clerk = await loadClerk();
    const res = await fetch('/api/me', { headers: { Authorization: `Bearer ${await clerk.session.getToken()}` } });
    if (!res.ok) throw new Error(`api/me ${res.status}`);
    const me = await res.json();
    account = { ...account, entitlements: me.entitlements };
    changed();
  } catch (err) {
    console.warn('Could not load what this account owns', err);
  }
}

/** Start Clerk in the background, so a returning visitor is signed in again. */
export function startAccounts() {
  if (!KEY) return;
  const go = () => loadClerk().catch((err) => console.warn('Clerk did not load', err));
  'requestIdleCallback' in window ? requestIdleCallback(go, { timeout: 2500 }) : setTimeout(go, 800);
}

/**
 * Opens Clerk's sign-in (Google). Resolves with the account once signed in.
 * Google's sign-in may leave the page and come back; `returnTo` is where it lands.
 */
export async function signInWithGoogle({ returnTo = location.href } = {}) {
  if (!KEY) throw new Error('setup');
  const clerk = await loadClerk();
  if (clerk.user) return account;
  return new Promise((resolve) => {
    const stop = clerk.addListener(({ user }) => {
      if (!user) return;
      stop();
      resolve(account);
    });
    clerk.openSignIn({ forceRedirectUrl: returnTo, signUpForceRedirectUrl: returnTo });
  });
}

/** Clerk's account button (avatar menu with sign-out) inside `el`. */
export async function mountAccountButton(el) {
  const clerk = await loadClerk();
  clerk.mountUserButton(el);
}

export async function signOut() {
  const clerk = await loadClerk();
  await clerk.signOut();
}
