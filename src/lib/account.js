// Accounts and what they own.
//
// Sign-in is "Sign in with Google" (Google Identity Services). It switches on when the
// site is built with VITE_GOOGLE_CLIENT_ID. What someone has paid for must come from our
// server (it checks the Google token and the payment), so until checkout is connected
// nobody owns any Pro world and `owns()` is always false. Nothing here can be trusted
// for enforcement on its own: the browser only decides what to show.

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const KEY = 'account';

let account = null;
try {
  account = JSON.parse(localStorage.getItem(KEY) || 'null');
} catch {}

export const signInAvailable = () => Boolean(CLIENT_ID);
export const currentAccount = () => account;

/** True when the signed-in account owns this world (or Pro). Filled in by the server later. */
export function owns(item) {
  return Boolean(account?.entitlements?.includes('pro') || account?.entitlements?.includes(item));
}

// Google's button script, loaded only when someone heads for sign-in.
let gisPromise = null;
function loadGis() {
  gisPromise ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve(window.google);
    s.onerror = () => reject(new Error('Could not reach Google sign-in.'));
    document.head.appendChild(s);
  });
  return gisPromise;
}

// The name and picture inside Google's token, for showing who is signed in. (The server
// verifies the token itself; this is display only.)
function readToken(jwt) {
  const part = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  const data = JSON.parse(decodeURIComponent(escape(atob(part))));
  return { name: data.name, email: data.email, picture: data.picture };
}

/** Opens Google's sign-in. Resolves with the account, or rejects with a readable reason. */
export async function signInWithGoogle() {
  if (!CLIENT_ID) throw new Error('setup');
  const google = await loadGis();
  return new Promise((resolve, reject) => {
    google.accounts.id.initialize({
      client_id: CLIENT_ID,
      callback: ({ credential }) => {
        account = { ...readToken(credential), entitlements: [] };
        try {
          localStorage.setItem(KEY, JSON.stringify(account));
        } catch {}
        resolve(account);
      },
    });
    google.accounts.id.prompt((n) => {
      if (n.isNotDisplayed?.() || n.isSkippedMoment?.()) reject(new Error('Google sign-in was closed.'));
    });
  });
}
