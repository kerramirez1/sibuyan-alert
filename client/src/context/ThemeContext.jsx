import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export const THEME_STORAGE_KEY = 'sibuyan-alert-theme';
export const THEMES = Object.freeze({ LIGHT: 'light', DARK: 'dark' });

const ThemeContext = createContext(null);

const isTheme = (value) => value === THEMES.LIGHT || value === THEMES.DARK;

export const getSystemTheme = () => (
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
        ? THEMES.DARK
        : THEMES.LIGHT
);

export const getInitialTheme = () => {
    if (typeof document !== 'undefined' && isTheme(document.documentElement.dataset.theme)) {
        return document.documentElement.dataset.theme;
    }

    try {
        const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
        if (isTheme(savedTheme)) return savedTheme;
    } catch {
        // Storage can be unavailable in private or restricted browsing contexts.
    }

    return getSystemTheme();
};

export const applyTheme = (theme) => {
    if (typeof document === 'undefined') return;

    const resolvedTheme = isTheme(theme) ? theme : THEMES.LIGHT;
    const root = document.documentElement;
    root.classList.toggle('dark', resolvedTheme === THEMES.DARK);
    root.dataset.theme = resolvedTheme;
    root.style.colorScheme = resolvedTheme;

    const themeColor = document.querySelector('meta[name="theme-color"]');
    themeColor?.setAttribute('content', resolvedTheme === THEMES.DARK ? '#111827' : '#ffffff');
};

export const ThemeProvider = ({ children }) => {
    const [theme, setThemeState] = useState(getInitialTheme);

    const setTheme = useCallback((nextTheme) => {
        const resolvedTheme = typeof nextTheme === 'function'
            ? nextTheme(getInitialTheme())
            : nextTheme;
        if (!isTheme(resolvedTheme)) return;

        applyTheme(resolvedTheme);
        try {
            window.localStorage.setItem(THEME_STORAGE_KEY, resolvedTheme);
        } catch {
            // The in-memory preference still works when storage is unavailable.
        }
        setThemeState(resolvedTheme);
    }, []);

    const toggleTheme = useCallback(() => {
        setTheme(theme === THEMES.DARK ? THEMES.LIGHT : THEMES.DARK);
    }, [setTheme, theme]);

    useEffect(() => {
        applyTheme(theme);

        const handleStorage = (event) => {
            if (event.key !== THEME_STORAGE_KEY) return;
            const nextTheme = isTheme(event.newValue) ? event.newValue : getSystemTheme();
            applyTheme(nextTheme);
            setThemeState(nextTheme);
        };
        const mediaQuery = window.matchMedia?.('(prefers-color-scheme: dark)');
        const handleSystemThemeChange = (event) => {
            let hasSavedTheme = false;
            try {
                hasSavedTheme = isTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
            } catch {
                // Follow the system when storage cannot hold an explicit preference.
            }
            if (hasSavedTheme) return;
            const nextTheme = event.matches ? THEMES.DARK : THEMES.LIGHT;
            applyTheme(nextTheme);
            setThemeState(nextTheme);
        };

        window.addEventListener('storage', handleStorage);
        mediaQuery?.addEventListener?.('change', handleSystemThemeChange);
        return () => {
            window.removeEventListener('storage', handleStorage);
            mediaQuery?.removeEventListener?.('change', handleSystemThemeChange);
        };
    }, [theme]);

    const value = useMemo(() => ({
        theme,
        isDark: theme === THEMES.DARK,
        setTheme,
        toggleTheme,
    }), [setTheme, theme, toggleTheme]);

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (!context) throw new Error('useTheme must be used within ThemeProvider');
    return context;
};
