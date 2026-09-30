export type Theme = 'light' | 'dark' | 'system';
const KEY = 'chipsplit_theme';

export function getTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(t: Theme = getTheme()) {
  const dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

export function setTheme(t: Theme) {
  try { localStorage.setItem(KEY, t); } catch { /* storage unavailable */ }
  applyTheme(t);
}
