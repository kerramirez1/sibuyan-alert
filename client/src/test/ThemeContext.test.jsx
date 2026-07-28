import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ThemeToggle from '../components/ui/ThemeToggle';
import {
    THEME_STORAGE_KEY,
    ThemeProvider,
    useTheme,
} from '../context/ThemeContext';

const ThemeStatus = () => {
    const { theme } = useTheme();
    return <output aria-label="active theme">{theme}</output>;
};

const renderTheme = () => render(
    <ThemeProvider>
        <ThemeToggle />
        <ThemeStatus />
    </ThemeProvider>
);

describe('ThemeProvider', () => {
    beforeEach(() => {
        window.localStorage.clear();
        document.documentElement.classList.remove('dark');
        delete document.documentElement.dataset.theme;
        window.matchMedia = vi.fn().mockImplementation((query) => ({
            matches: query === '(prefers-color-scheme: dark)',
            media: query,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        }));
    });

    afterEach(() => {
        window.localStorage.clear();
        document.documentElement.classList.remove('dark');
        delete document.documentElement.dataset.theme;
    });

    it('uses the operating system preference on the first visit', () => {
        renderTheme();

        expect(screen.getByLabelText('active theme')).toHaveTextContent('dark');
        expect(document.documentElement).toHaveClass('dark');
        expect(screen.getByRole('button', { name: 'Switch to light mode' })).toBeVisible();
    });

    it('switches themes immediately and persists the selection', () => {
        renderTheme();

        fireEvent.click(screen.getByRole('button', { name: 'Switch to light mode' }));

        expect(screen.getByLabelText('active theme')).toHaveTextContent('light');
        expect(document.documentElement).not.toHaveClass('dark');
        expect(document.documentElement.dataset.theme).toBe('light');
        expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
        expect(screen.getByRole('button', { name: 'Switch to dark mode' })).toBeVisible();
    });

    it('restores a saved preference before falling back to the system theme', () => {
        window.localStorage.setItem(THEME_STORAGE_KEY, 'light');

        renderTheme();

        expect(screen.getByLabelText('active theme')).toHaveTextContent('light');
        expect(document.documentElement).not.toHaveClass('dark');

        fireEvent.click(screen.getByRole('button', { name: 'Switch to dark mode' }));

        expect(screen.getByLabelText('active theme')).toHaveTextContent('dark');
        expect(document.documentElement).toHaveClass('dark');
        expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    });
});
