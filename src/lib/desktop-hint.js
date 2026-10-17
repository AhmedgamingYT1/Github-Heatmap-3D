// A one-time note on phones: the 3D worlds are made for a big screen.
// Dismissed once, it stays dismissed (per browser).
const KEY = 'desktop-hint-seen';

export function suggestDesktop() {
  const phone = matchMedia('(max-width: 760px)').matches && matchMedia('(pointer: coarse)').matches;
  if (!phone) return;
  try {
    if (localStorage.getItem(KEY)) return;
  } catch {}
  injectStyles();
  const note = document.createElement('div');
  note.className = 'dh';
  note.setAttribute('role', 'status');
  note.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
    <span><b>Best on a computer.</b> The 3D worlds are made for a big screen. You can still look around here.</span>
    <button type="button">Got it</button>`;
  const close = () => {
    note.classList.add('out');
    setTimeout(() => note.remove(), 300);
    try {
      localStorage.setItem(KEY, '1');
    } catch {}
  };
  note.querySelector('button').addEventListener('click', close);
  document.body.appendChild(note);
}

function injectStyles() {
  const style = document.createElement('style');
  style.textContent = `
.dh {
  position: fixed; z-index: 200; left: 10px; right: 10px; top: max(10px, env(safe-area-inset-top));
  display: flex; align-items: center; gap: 12px; padding: 12px 12px 12px 14px; border-radius: 18px;
  color: #f4f4f6; background: rgba(18, 18, 22, 0.9); border: 1px solid rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); box-shadow: 0 16px 40px rgba(0, 0, 0, 0.3);
  font: 13px/1.4 'Geist Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  animation: dh-in 0.4s cubic-bezier(.2, .8, .2, 1);
}
.dh.out { opacity: 0; transform: translateY(-10px); transition: opacity 0.25s, transform 0.25s; }
.dh svg { width: 22px; height: 22px; flex: none; color: #9be9a8; }
.dh span { flex: 1; color: #c9c9d1; }
.dh b { color: #fff; font-weight: 600; }
.dh button { flex: none; border: 0; border-radius: 999px; padding: 8px 12px; font: 600 13px/1 inherit; font-family: inherit; color: #0b0b0d; background: #ededef; cursor: pointer; }
@keyframes dh-in { from { opacity: 0; transform: translateY(-10px); } }
`;
  document.head.appendChild(style);
}
