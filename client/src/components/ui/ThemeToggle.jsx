import { HiOutlineMoon, HiOutlineSun } from 'react-icons/hi';
import { useTheme } from '../../context/ThemeContext';

const ThemeToggle = ({ className = '', showLabel = false }) => {
    const { isDark, toggleTheme } = useTheme();
    const label = isDark ? 'Switch to light mode' : 'Switch to dark mode';
    const Icon = isDark ? HiOutlineSun : HiOutlineMoon;

    return (
        <button
            type="button"
            onClick={toggleTheme}
            className={`theme-toggle inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${showLabel ? '' : 'min-w-11'} ${className}`}
            aria-label={label}
            title={label}
        >
            <Icon className="h-5 w-5" aria-hidden="true" />
            {showLabel && <span className="text-sm font-medium">{isDark ? 'Light mode' : 'Dark mode'}</span>}
        </button>
    );
};

export default ThemeToggle;
