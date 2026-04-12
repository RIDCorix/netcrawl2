import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  // Global ignores
  { ignores: ['**/dist/**', '**/node_modules/**', '**/release/**', 'packages/desktop/**', 'workspace/**', 'workspace_example/**'] },

  // Base JS rules
  js.configs.recommended,

  // TypeScript rules (type-aware linting disabled for speed — enable per-package if desired)
  ...tseslint.configs.recommended,

  // Disable rules that conflict with Prettier
  eslintConfigPrettier,

  // Project-specific overrides
  {
    rules: {
      // Relax rules for gradual adoption
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'prefer-const': 'warn',
    },
  },

  // Disable unknown rule references from inline comments (react-hooks not installed yet)
  {
    linterOptions: {
      reportUnusedDisableDirectives: 'warn',
    },
  },
);
