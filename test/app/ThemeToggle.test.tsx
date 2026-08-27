import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, describe, expect, it} from 'vitest';

import {ThemeToggle} from '../../src/app/components/ThemeToggle';

afterEach(() => {
  window.localStorage.removeItem('hackweek.theme');
  delete document.documentElement.dataset.theme;
});

describe('theme toggle', () => {
  it('switches modes and remembers the selected theme', async () => {
    render(<ThemeToggle />);

    const toggle = screen.getByRole('button', {name: 'Switch to dark mode'});
    await userEvent.click(toggle);

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(window.localStorage.getItem('hackweek.theme')).toBe('dark');
    expect(toggle.getAttribute('aria-label')).toBe('Switch to light mode');
  });
});
