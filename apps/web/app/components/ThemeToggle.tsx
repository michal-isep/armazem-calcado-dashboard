'use client';

import { useSyncExternalStore } from 'react';

type Theme = 'system' | 'light' | 'dark';
const KEY = 'theme';

/** Applied before first paint (see layout.tsx) so the page does not flash. */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem('${KEY}');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
const read = (): Theme => {
  const stored = localStorage.getItem(KEY);
  return stored === 'light' || stored === 'dark' ? stored : 'system';
};

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, read, () => 'system' as Theme);

  function choose(next: Theme) {
    if (next === 'system') {
      localStorage.removeItem(KEY);
      delete document.documentElement.dataset.theme;
    } else {
      localStorage.setItem(KEY, next);
      document.documentElement.dataset.theme = next;
    }
    listeners.forEach((cb) => cb());
  }

  return (
    <label className="theme-toggle">
      Theme{' '}
      <select
        value={theme}
        onChange={(e) => choose(e.target.value as Theme)}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
