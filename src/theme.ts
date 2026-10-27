export type Theme = 'light' | 'dark' | 'system';

const KEY = 'chms-ledger.theme';

// Kept in localStorage (not the database) so the right colors show before anything loads.
export function getTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    if (t === 'light' || t === 'dark' || t === 'system') return t;
  } catch {
    // Storage blocked: fall back to the default.
  }
  return 'light';
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#202124' : '#ffffff');
}

export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Still applies for this visit.
  }
  applyTheme(theme);
}
