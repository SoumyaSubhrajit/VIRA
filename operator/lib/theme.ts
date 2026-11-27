export type UiTheme = 'light' | 'midnight' | 'paper';

export const UI_THEMES: Array<{ id: UiTheme; label: string }> = [
  { id: 'light', label: 'Clean Light' },
  { id: 'paper', label: 'Warm Paper' },
  { id: 'midnight', label: 'Midnight' },
];

const STORAGE_KEY = 'vira-ui-theme';

export function getSavedUiTheme(): UiTheme {
  if (typeof window === 'undefined') return 'light';
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === 'midnight' || saved === 'paper' || saved === 'light') return saved;
  return 'light';
}

export function applyUiTheme(theme: UiTheme): void {
  if (typeof document === 'undefined') return;
  if (theme === 'light') {
    document.documentElement.removeAttribute('data-ui-theme');
  } else {
    document.documentElement.setAttribute('data-ui-theme', theme);
  }
  window.localStorage.setItem(STORAGE_KEY, theme);
}
