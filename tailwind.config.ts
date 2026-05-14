import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: 'oklch(var(--background-raw) / <alpha-value>)',
        foreground: 'oklch(var(--foreground-raw) / <alpha-value>)',
        border: 'oklch(var(--border-raw) / <alpha-value>)',
        input: 'oklch(var(--input-raw) / <alpha-value>)',
        ring: 'oklch(var(--ring-raw) / <alpha-value>)',
        primary: {
          DEFAULT: 'oklch(var(--primary-raw) / <alpha-value>)',
          foreground: 'oklch(var(--primary-foreground-raw) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'oklch(var(--secondary-raw) / <alpha-value>)',
          foreground: 'oklch(var(--secondary-foreground-raw) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'oklch(var(--muted-raw) / <alpha-value>)',
          foreground: 'oklch(var(--muted-foreground-raw) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'oklch(var(--accent-raw) / <alpha-value>)',
          foreground: 'oklch(var(--accent-foreground-raw) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'oklch(var(--destructive-raw) / <alpha-value>)',
          foreground: 'oklch(var(--destructive-foreground-raw) / <alpha-value>)',
        },
        card: {
          DEFAULT: 'oklch(var(--card-raw) / <alpha-value>)',
          foreground: 'oklch(var(--card-foreground-raw) / <alpha-value>)',
        },
        popover: {
          DEFAULT: 'oklch(var(--popover-raw) / <alpha-value>)',
          foreground: 'oklch(var(--popover-foreground-raw) / <alpha-value>)',
        },
        sidebar: {
          DEFAULT: 'oklch(var(--sidebar-raw) / <alpha-value>)',
          foreground: 'oklch(var(--sidebar-foreground-raw) / <alpha-value>)',
          primary: 'oklch(var(--sidebar-primary-raw) / <alpha-value>)',
          'primary-foreground': 'oklch(var(--sidebar-primary-foreground-raw) / <alpha-value>)',
          accent: 'oklch(var(--sidebar-accent-raw) / <alpha-value>)',
          'accent-foreground': 'oklch(var(--sidebar-accent-foreground-raw) / <alpha-value>)',
          border: 'oklch(var(--sidebar-border-raw) / <alpha-value>)',
          ring: 'oklch(var(--sidebar-ring-raw) / <alpha-value>)',
        },
        chart: {
          '1': 'oklch(var(--chart-1-raw) / <alpha-value>)',
          '2': 'oklch(var(--chart-2-raw) / <alpha-value>)',
          '3': 'oklch(var(--chart-3-raw) / <alpha-value>)',
          '4': 'oklch(var(--chart-4-raw) / <alpha-value>)',
          '5': 'oklch(var(--chart-5-raw) / <alpha-value>)',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        xl: 'calc(var(--radius) + 4px)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Geist Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}

export default config
