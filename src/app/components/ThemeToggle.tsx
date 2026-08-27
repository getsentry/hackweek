import {useEffect, useState} from 'react';

import {
  applyTheme,
  getStoredTheme,
  getSystemTheme,
  storeTheme,
  type Theme,
} from '../theme';

export function ThemeToggle({className = ''}: {className?: string}) {
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme() ?? getSystemTheme());

  useEffect(() => {
    const storedTheme = getStoredTheme();
    const activeTheme = storedTheme ?? getSystemTheme();
    setTheme(activeTheme);
    applyTheme(activeTheme);

    if (storedTheme || !window.matchMedia) return;

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const syncWithSystem = (event: MediaQueryListEvent) => {
      if (getStoredTheme()) return;
      const nextTheme = event.matches ? 'dark' : 'light';
      setTheme(nextTheme);
      applyTheme(nextTheme);
    };
    media.addEventListener('change', syncWithSystem);
    return () => media.removeEventListener('change', syncWithSystem);
  }, []);

  function toggleTheme() {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    applyTheme(nextTheme);
    storeTheme(nextTheme);
  }

  const nextTheme = theme === 'dark' ? 'light' : 'dark';

  return (
    <button
      className={`themeToggle${className ? ` ${className}` : ''}`}
      type="button"
      aria-label={`Switch to ${nextTheme} mode`}
      title={`Switch to ${nextTheme} mode`}
      aria-pressed={theme === 'dark'}
      onClick={toggleTheme}
    >
      <span className="themeToggleSun" aria-hidden="true">
        ☀
      </span>
      <span className="themeToggleMoon" aria-hidden="true">
        ☾
      </span>
      <span className="themeToggleThumb" aria-hidden="true" />
    </button>
  );
}
