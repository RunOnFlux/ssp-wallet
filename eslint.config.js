import reactRefresh from 'eslint-plugin-react-refresh';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import typeScriptEsLint from '@typescript-eslint/eslint-plugin';

export default [
    {
        files: ["**/*.ts", "**/*.tsx"],
        plugins: { 
            reactRefresh, 
            react, 
            reactHooks, 
            typeScriptEsLint
        },
        rules: {
            // Key rules not found, will need to wait for fixes
            // 'react-refresh/only-export-components': [
            //     'warn',
            //     { allowConstantExport: true },
            // ],
            '@typescript-eslint/no-non-null-assertion': 'off',
            'react-hooks/exhaustive-deps': 'off',
            quotes: ['error', 'single'],
            'object-curly-spacing': ['error', 'always'],
            'array-bracket-spacing': ['error', 'never'],
            'react/require-default-props': ['error'],
            'react/default-props-match-prop-types': ['error'],
            'react/sort-prop-types': ['error'],
        },
        languageOptions: {
            parserOptions: {
                parser: '@typescript-eslint/parser',
            },
            globals: {
                browser: true, 
                es2020: true,
                chrome: true,
            },
        },
        // ignore file is replaced with ignores
        ignores: ['.eslintrc.cjs','vite.config.ts','index.html']
    },
    {
        "files": ["*.js", "*.jsx"],
        "rules": {
            "@typescript-eslint/no-unused-vars": "off",
            "@typescript-eslint/no-unsafe-return": "off",
            "@typescript-eslint/no-unsafe-call": "off",
            "@typescript-eslint/no-unsafe-assignment": "off",
            "@typescript-eslint/no-unsafe-member-access": "off",
            "@typescript-eslint/no-misused-promises": "off",
        }
    }
];