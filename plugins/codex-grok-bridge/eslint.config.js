const js = require('@eslint/js');
const tseslint = require('typescript-eslint');

module.exports = tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'mcp/server.cjs']
  },
  {
    files: ['*.js'],
    ...js.configs.recommended,
    languageOptions: {
      globals: {
        __dirname: 'readonly',
        module: 'readonly',
        require: 'readonly'
      }
    }
  },
  {
    files: ['src/**/*.ts', 'tests/**/*.ts', 'vitest.config.ts'],
    extends: [...tseslint.configs.recommended],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.test.json',
        tsconfigRootDir: __dirname
      }
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
    }
  }
);
