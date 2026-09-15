/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    darkMode: 'class',
    theme: {
        screens: {
            'xs': '475px',
            'sm': '640px',
            'md': '768px',
            'lg': '1024px',
            'xl': '1280px',
            '2xl': '1536px',
        },
        extend: {
            colors: {
                // Navy Command — primary app chrome (sidebar, headers, primary actions).
                // Keeps status colors (amber/blue/cyan/green/red) reserved for data only.
                primary: {
                    50: '#F0F4F8',
                    100: '#DCE6F0',
                    200: '#B9CDE3',
                    300: '#8FADC9',
                    400: '#5B84AC',
                    500: '#35648F',
                    600: '#1E4A75',
                    700: '#14385C',
                    800: '#0F2A44',
                    900: '#0C2236',
                    950: '#0A1C2E',
                },
                // Signal Red — the single alert CTA per view (Submit Report).
                alert: {
                    50: '#FEF2F2',
                    100: '#FEE2E2',
                    200: '#FECACA',
                    300: '#FCA5A5',
                    400: '#F87171',
                    500: '#EF4444',
                    600: '#DC2626',
                    700: '#B91C1C',
                    800: '#991B1B',
                    900: '#7F1D1D',
                },
                accent: {
                    50: '#FFFBEB',
                    100: '#FEF3C7',
                    200: '#FDE68A',
                    300: '#FCD34D',
                    400: '#FBBF24',
                    500: '#F59E0B',
                    600: '#D97706',
                    700: '#B45309',
                    800: '#92400E',
                    900: '#78350F',
                },
                danger: {
                    50: '#FEF2F2',
                    100: '#FEE2E2',
                    200: '#FECACA',
                    300: '#FCA5A5',
                    400: '#F87171',
                    500: '#EF4444',
                    600: '#DC2626',
                    700: '#B91C1C',
                    800: '#991B1B',
                    900: '#7F1D1D',
                },
                success: {
                    50: '#ECFDF5',
                    100: '#D1FAE5',
                    200: '#A7F3D0',
                    300: '#6EE7B7',
                    400: '#34D399',
                    500: '#10B981',
                    600: '#059669',
                    700: '#047857',
                    800: '#065F46',
                    900: '#064E3B',
                },
                gray: {
                    50: '#F9FAFB',
                    100: '#F3F4F6',
                    200: '#E5E7EB',
                    300: '#D1D5DB',
                    400: '#9CA3AF',
                    500: '#6B7280',
                    600: '#4B5563',
                    700: '#374151',
                    800: '#1F2937',
                    900: '#111827',
                    950: '#030712',
                },
                brand: {
                    50: '#F0F4F8', // Sidebar tint / hover wash
                    100: '#DCE6F0',
                    200: '#B9CDE3',
                    300: '#8FADC9',
                    400: '#5B84AC',
                    500: '#35648F',
                    600: '#1E4A75',
                    700: '#14385C', // Primary navy action
                    800: '#0F2A44', // Command navy
                    900: '#0C2236',
                    950: '#0A1C2E', // Sidebar / footer
                },
            },
            fontFamily: {
                sans: ['Inter', 'system-ui', 'sans-serif'],
                display: ['Outfit', 'system-ui', 'sans-serif'],
            },
            fontWeight: {
                black: '900',
            },
            animation: {
                'slide-in': 'slideIn 0.3s ease-out',
                'slide-out': 'slideOut 0.3s ease-in',
                'fade-in': 'fadeIn 0.2s ease-out',
                'fade-out': 'fadeOut 0.2s ease-in',
                'bounce-in': 'bounceIn 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
                'pulse-soft': 'pulseSoft 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                'spin-slow': 'spin 3s linear infinite',
                'shake': 'shake 0.5s ease-in-out',
                'ping-slow': 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite',
                'gradient': 'gradient 8s ease infinite',
                'shimmer': 'shimmer 2.5s ease-in-out infinite',
                // High-risk zone marker ripple. The duration is read from a CSS
                // variable so a React prop can retune it at runtime (Tailwind's
                // JIT can only emit static arbitrary values).
                'risk-ripple': 'riskRipple var(--risk-ripple-duration, 2s) cubic-bezier(0.22, 0.61, 0.36, 1) infinite',
            },
            keyframes: {
                slideIn: {
                    '0%': { transform: 'translateX(-100%)', opacity: '0' },
                    '100%': { transform: 'translateX(0)', opacity: '1' },
                },
                slideOut: {
                    '0%': { transform: 'translateX(0)', opacity: '1' },
                    '100%': { transform: 'translateX(100%)', opacity: '0' },
                },
                fadeIn: {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                fadeOut: {
                    '0%': { opacity: '1' },
                    '100%': { opacity: '0' },
                },
                bounceIn: {
                    '0%': { transform: 'scale(0)', opacity: '0' },
                    '50%': { transform: 'scale(1.1)' },
                    '100%': { transform: 'scale(1)', opacity: '1' },
                },
                pulseSoft: {
                    '0%, 100%': { opacity: '1' },
                    '50%': { opacity: '0.7' },
                },
                shake: {
                    '0%, 100%': { transform: 'translateX(0)' },
                    '25%': { transform: 'translateX(-5px)' },
                    '75%': { transform: 'translateX(5px)' },
                },
                gradient: {
                    '0%, 100%': { backgroundPosition: '0% 50%' },
                    '50%': { backgroundPosition: '100% 50%' },
                },
                shimmer: {
                    '0%': { transform: 'translateX(-100%)' },
                    '100%': { transform: 'translateX(100%)' },
                },
                // One ripple wave: a filled red disc that grows outwards and
                // fades to fully transparent. Staggering several of these with
                // negative animation delays produces the continuous pulse.
                riskRipple: {
                    '0%': { transform: 'scale(0.32)', opacity: '0.85' },
                    '70%': { opacity: '0.28' },
                    '100%': { transform: 'scale(1)', opacity: '0' },
                },
            },
            backgroundSize: {
                '200%': '200% 200%',
            },
            boxShadow: {
                'glass': '0 8px 32px 0 rgba(31, 38, 135, 0.15)',
                'glass-dark': '0 8px 32px 0 rgba(0, 0, 0, 0.3)',
                'soft': '0 2px 15px -3px rgba(0, 0, 0, 0.07), 0 10px 20px -2px rgba(0, 0, 0, 0.04)',
                'glow': '0 0 20px rgba(59, 130, 246, 0.3)',
                'danger-glow': '0 0 20px rgba(239, 68, 68, 0.3)',
            },
            backdropBlur: {
                'glass': '16px',
            },
        },
    },
    plugins: [],
}
