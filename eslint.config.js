const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const reactHooksPlugin = require('eslint-plugin-react-hooks');

module.exports = tseslint.config(
  // Global ignores
  {
    ignores: [
      'node_modules/',
      '**/node_modules/',
      '**/.next/',
      'android/',
      'ios/',
      'server/',
      'scripts/',
      'dist/',
      'src/assets/',
      '**/src/assets/**',
      '*.config.js',
      '*.config.cjs',
      'babel.config.js',
      'metro.config.js',
      'jest.config.js',
      'index.js',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: {
      'react-hooks': reactHooksPlugin,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-require-imports': 'off',
      'no-console': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
);
