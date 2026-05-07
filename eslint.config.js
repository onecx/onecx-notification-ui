const nx = require('@nx/eslint-plugin')

module.exports = [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: [
      'dist',
      'helm',
      'nginx',
      'reports',
      'node_modules',
      '.nx',
      '.angular',
      '.husky',
      '.docusaurus',
      '.github',
      '.scannerwork',
      '.dockerignore',
      '.prettierignore',
      '.browserslistrc',
      '.eslintcache',
      'LICENSE',
      'CHANGELOG.md',
      'README.md',
      'Dockerfile',
      '*.log',
      '*.sh',
      'src/app/shared/generated/**',
      'src/**/*.ico',
      'src/**/*.svg'
    ]
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    // Override or add rules here
    rules: {}
  },
  ...nx.configs['flat/angular'],
  ...nx.configs['flat/angular-template'],
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { vars: 'all', args: 'none' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: 'app',
          style: 'camelCase'
        }
      ],
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: 'app',
          style: 'kebab-case'
        }
      ]
    }
  },
  {
    files: ['**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-require-imports': [
        'off',
        {
          allowAsImport: true
        }
      ]
    }
  },
  {
    files: ['**/*.html'],
    // Override or add rules here
    rules: {
      '@typescript-eslint/ban-ts-comment': 'off'
    }
  }
]
