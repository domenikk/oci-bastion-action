import parser from '@typescript-eslint/parser';
import typescriptPlugin from '@typescript-eslint/eslint-plugin';
import stylistic from '@stylistic/eslint-plugin';

export default [
  {
    ignores: ['.*', '**/node_modules/', '**/dist/', '**/coverage/', '*.json']
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'error'
    },
    plugins: {
      '@typescript-eslint': typescriptPlugin,
      '@stylistic': stylistic
    },
    rules: {
      'no-duplicate-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_$'
        }
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/prefer-function-type': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      'prefer-template': 'error',
      '@stylistic/template-curly-spacing': ['error', 'never'],
      'no-eval': 'error',
      'no-useless-escape': 'error',
      'no-console': 'warn',
      'no-loop-func': 'error',
      'no-param-reassign': 'error',
      'prefer-arrow-callback': 'error',
      'no-useless-constructor': 'error',
      'no-dupe-class-members': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'one-var': ['error', 'never'],
      'no-nested-ternary': 'error',
      'no-unneeded-ternary': 'error'
    }
  }
];
