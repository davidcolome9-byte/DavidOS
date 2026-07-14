// Flat ESLint config. Pragmatic: recommended TS + react-hooks rules,
// tuned so `npm run lint` is a meaningful gate without fighting the
// existing codebase style. Justify any rule change in docs/DECISIONS.md.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: [
      'dist/',
      'node_modules/',
      'personal/',
      'coverage/',
      'playwright-report/',
      'test-results/',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      globals: {
        window: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
        navigator: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        Blob: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        FileReader: 'readonly',
        FormData: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        confirm: 'readonly',
        alert: 'readonly',
        HTMLElement: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLTextAreaElement: 'readonly',
        HTMLSelectElement: 'readonly',
        KeyboardEvent: 'readonly',
        MouseEvent: 'readonly',
        Event: 'readonly',
      },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // The URL-param→state sync effects in WorkflowRunner/Settings predate
      // this rule (react-hooks v7); refactoring them is behavior risk with no
      // user-visible gain. Revisit if those components are rewritten.
      'react-hooks/set-state-in-effect': 'off',
      // Unused vars stay errors but allow deliberate _-prefixed ones.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Metric-extraction regexes use defensive '\-' escapes inside character
    // classes. Removing them can silently create ranges — leave them alone.
    files: ['src/lib/workflows/fitnessExtraction.ts'],
    rules: { 'no-useless-escape': 'off' },
  },
  {
    files: ['scripts/**/*.mjs', '*.config.js', '*.config.ts', 'tests/**/*.ts'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        __dirname: 'readonly',
      },
    },
  },
  {
    files: ['public/sw.js'],
    languageOptions: {
      globals: {
        self: 'readonly',
        caches: 'readonly',
        fetch: 'readonly',
        console: 'readonly',
        URL: 'readonly',
        encodeURIComponent: 'readonly',
      },
    },
  },
);
