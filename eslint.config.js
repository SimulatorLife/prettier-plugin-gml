import js from "@eslint/js";
import globals from "globals";

/* Plugins (all optional but used for stricter scans) */
import pluginUnicorn from "eslint-plugin-unicorn";
import pluginSonarjs from "eslint-plugin-sonarjs";
import pluginSecurity from "eslint-plugin-security";
import pluginImport from "eslint-plugin-import";
import pluginPromise from "eslint-plugin-promise";
import pluginRegexp from "eslint-plugin-regexp";
import pluginNoSecrets from "eslint-plugin-no-secrets";
import pluginEslintComments from "eslint-plugin-eslint-comments";

/* Config */
import eslintConfigPrettier from "eslint-config-prettier";

export default [
    {
        ignores: [
            "node_modules/*",
            "build/*",
            "*.md",
            ".antlr/*",
            "resources/*",
            "src/vendor/*.js",
            "generated/*",
            "src/parser/src/generated/**/*",
            "*.gml",
            ".DS_Store",
            "LICENSE",
            ".github/**",
            "*.g4"
        ]
    },

    /* Base ESLint recommended */
    js.configs.recommended,

    /* ESLint plugin: unicorn recommended rules.
     * This brings in { plugins: { unicorn: … }, rules: { unicorn/* … } } */
    pluginUnicorn.configs.recommended,

    pluginPromise.configs["flat/recommended"],

    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: {
                ...globals.node,
                ...globals.browser
            }
        },

        /* Needed for plugin rules */
        plugins: {
            sonarjs: pluginSonarjs,
            security: pluginSecurity,
            import: pluginImport,
            regexp: pluginRegexp,
            "no-secrets": pluginNoSecrets,
            "eslint-comments": pluginEslintComments
        },

        /* Helpful for import/plugin-import */
        settings: {
            "import/resolver": {
                node: { extensions: [".js", ".cjs", ".mjs"] }
            }
        },

        rules: {
            indent: ["error", 4, { SwitchCase: 1 }],
            quotes: ["warn", "double", { avoidEscape: true }],
            semi: ["error", "always"],
            "no-unused-vars": ["warn"],
            "no-console": ["off"],
            "comma-dangle": ["off", "never"],
            "no-prototype-builtins": ["warn"],
            "no-useless-escape": ["warn"],
            "no-with": ["error"],
            "no-undef": ["error"],

            /* --- core "bad practice" rules --- */
            complexity: ["warn", { max: 12 }],
            "max-depth": ["warn", 3],
            "max-lines": [
                "warn",
                {
                    max: 500,
                    skipBlankLines: true,
                    skipComments: true
                }
            ],
            "max-lines-per-function": [
                "warn",
                {
                    max: 100,
                    skipBlankLines: true,
                    skipComments: true
                }
            ],
            "max-params": ["warn", 5],
            "max-statements": ["warn", 20],
            "max-statements-per-line": ["error", { max: 1 }],
            "max-nested-callbacks": ["warn", 3],
            "require-atomic-updates": "warn",
            "no-implicit-coercion": ["error", { boolean: false }], // allow !!
            "no-implied-eval": "error",
            "no-param-reassign": ["warn", { props: true }],
            "no-return-assign": ["error", "always"],
            "no-throw-literal": "error",
            "no-constructor-return": "warn",
            "no-warning-comments": [
                "warn",
                { terms: ["todo", "fixme"], location: "start" }
            ],
            "no-restricted-syntax": [
                "warn",
                {
                    selector: "LabeledStatement",
                    message: "Labels make flow harder to follow."
                },
                {
                    selector: "ForInStatement",
                    message:
                        "Use Object.keys/entries with for..of instead of for..in."
                }
            ],
            "consistent-return": [
                "warn",
                { treatUndefinedAsUnspecified: true }
            ],
            eqeqeq: ["warn", "always", { null: "ignore" }],
            "default-case-last": "error",
            radix: ["warn", "as-needed"],
            yoda: ["error", "never", { exceptRange: true }],

            /* unicorn plugin tweaks beyond the preset */
            "unicorn/no-empty-file": "error",
            "unicorn/consistent-function-scoping": "warn",
            "unicorn/no-abusive-eslint-disable": "warn",
            "unicorn/error-message": "error",
            "unicorn/no-useless-length-check": "error",
            "unicorn/no-array-push-push": "error",
            "unicorn/prefer-query-selector": "warn",
            "unicorn/no-unreadable-array-destructuring": "warn",
            "unicorn/no-await-in-promise-methods": "error",
            "unicorn/no-hex-escape": "error",
            "unicorn/no-zero-fractions": "error",
            "unicorn/prevent-abbreviations": "off",
            "unicorn/prefer-code-point": "warn",
            "unicorn/no-array-sort": "warn",
            "unicorn/no-array-callback-reference": "warn",
            "unicorn/prefer-ternary": "warn",
            "unicorn/no-useless-undefined": "warn",
            // Prettier's path.map(callback, property) requires the second argument,
            // so disable the auto-fix that strips it as an unused thisArg.
            "unicorn/no-array-method-this-argument": "off",
            "unicorn/no-object-as-default-parameter": "warn",
            "unicorn/prefer-single-call": "warn",
            "unicorn/prefer-default-parameters": "warn",
            "unicorn/prefer-top-level-await": "warn",
            "unicorn/prefer-switch": "warn",
            "unicorn/prefer-array-some": "warn",
            "unicorn/no-this-assignment": "warn",
            "unicorn/prefer-at": "warn",
            "unicorn/no-new-array": "warn",
            "unicorn/no-array-reverse": "warn",

            "unicorn/no-array-reduce": "off",
            "unicorn/prefer-spread": "off",
            "unicorn/no-array-for-each": "off",
            "unicorn/no-null": "off",

            /* --- plugin: sonarjs (code smells) --- */
            "sonarjs/cognitive-complexity": ["warn", 15],
            "sonarjs/no-duplicate-string": ["warn", { threshold: 3 }],
            "sonarjs/no-identical-functions": "error",
            "sonarjs/no-inverted-boolean-check": "warn",
            "sonarjs/no-redundant-boolean": "warn",
            "sonarjs/no-small-switch": "warn",

            /* --- plugin: regexp (regex safety/perf) --- */
            "regexp/no-super-linear-backtracking": "warn",
            "regexp/optimal-quantifier-concatenation": "error",

            /* --- plugin: import (correctness & hygiene) --- */
            "import/first": "error",
            "import/no-mutable-exports": "error",
            "import/no-cycle": ["error", { maxDepth: 3 }],
            "import/newline-after-import": ["error", { count: 1 }],

            /* --- plugin: promise (stricter async) --- */
            "promise/no-return-wrap": "warn",
            "promise/no-multiple-resolved": "error",

            /* --- plugin: security (selected high-signal checks) --- */
            "security/detect-eval-with-expression": "error",
            "security/detect-new-buffer": "error",
            "security/detect-child-process": "error",
            "security/detect-unsafe-regex": "warn",

            /* --- plugin: no-secrets (obvious credential leaks) --- */
            "no-secrets/no-secrets": [
                "warn",
                {
                    tolerance: 4.2,
                    ignoreContent: ["-----BEGIN"],
                    ignoreIdentifiers: ["API_KEY"]
                }
            ],

            /* --- plugin: eslint-comments (comment hygiene) --- */
            "eslint-comments/require-description": [
                "warn",
                { ignore: ["eslint-enable", "eslint-env"] }
            ],
            "eslint-comments/no-unused-disable": "error"
        }
    },
    /* CLI: allow process.exit */
    {
        files: ["src/cli/**"],
        rules: {
            "unicorn/no-process-exit": "off"
        }
    },
    /* Tests: relax a few noisy limits */
    {
        files: ["**/tests/**", "*.test.*js", "*.spec.js"],
        rules: {
            quotes: ["off"],
            "max-lines-per-function": "off",
            "max-lines": "off",
            "max-statements": "off",
            "sonarjs/no-duplicate-string": "off",
            complexity: ["warn", { max: 35 }],
            "no-restricted-syntax": "off",
            "no-throw-literal": "warn"
        }
    },

    /* Place eslint-config-prettier last to prevent ESLint/Prettier fights */
    eslintConfigPrettier
];
