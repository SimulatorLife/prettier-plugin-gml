// eslint.config.ts
// ESLint Flat Config for the project. Agents: Do NOT modify this to relax rules to 'fix' lint errors. Fix the underlying issues instead.

import path from "node:path";
import { fileURLToPath } from "node:url";

import js from "@eslint/js";
import tseslint from "typescript-eslint";
import { defineConfig } from "eslint/config";
import globals from "globals";

import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript";

// YAML parser
import yamlParser from "yaml-eslint-parser";

// Plugins
import pluginBoundaries from "eslint-plugin-boundaries";
import pluginUnicorn from "eslint-plugin-unicorn";
import pluginSonarjs from "eslint-plugin-sonarjs";
import pluginSecurity from "eslint-plugin-security";
import pluginImport from "eslint-plugin-import-x";
import pluginPromise from "eslint-plugin-promise";
import pluginRegexp from "eslint-plugin-regexp";
import pluginNoSecrets from "eslint-plugin-no-secrets";
import pluginEslintComments from "eslint-plugin-eslint-comments";
import pluginUnusedImports from "eslint-plugin-unused-imports";
import pluginDeMorgan from "eslint-plugin-de-morgan";
import pluginYml from "eslint-plugin-yml";

// Prettier config
import eslintConfigPrettier from "eslint-config-prettier";

const tsconfigRootDir = path.dirname(fileURLToPath(import.meta.url));
const tsImportResolver = createTypeScriptImportResolver({
    project: ["./tsconfig.eslint.json"]
});

const typeScriptPlugin = { "@typescript-eslint": tseslint.plugin };

const baseIgnorePatterns = [
    "**/*.d.ts",
    "**/*.config.js",
    "**/node_modules/**",
    "**/build/**",
    "**/*.md",
    "**/*antlr/*",
    "./resources/**",
    "**/vendor/**",
    "**/dist/**",
    "**/reports/**",
    "**/*.gml",
    ".DS_Store",
    "LICENSE",
    "**/*.g4",
    "scripts/**",
    "tools/**",
    ".tools/**",
    "tmp/**"
    // NOTE: Do not ignore `.github/**` here because we want to lint
    // workflow YAML files (GH Actions) with eslint-plugin-yml. Workflows
    // are validated by the YAML rule set defined below (files: **/*.yml)
    // Removing the blanket ignore allows the `.github/*.yml` files to
    // be picked up by `npm run lint:yaml` and by CI checks.
];

/**
 * TypeScript configuration:
 * - Scoped to .ts files
 * - Includes:
 *   - Base ESLint recommended rules
 *   - TypeScript ESLint recommended + type-checked rules
 *   - de-morgan, unicorn, promise presets
 *   - Your custom plugins, settings, and rules
 */
const tsConfig = defineConfig({
    files: ["**/*.ts"],

    languageOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        globals: {
            ...globals.node,
            NodeJS: "readonly",
            BufferEncoding: "readonly",
            Element: "readonly",
            Document: "readonly"
        },
        parser: tseslint.parser,
        parserOptions: {
            // Use specific tsconfig instead of project service to avoid
            // TypeScript overload signature issues with complex function types
            project: ["./tsconfig.eslint.json"],
            tsconfigRootDir
        }
    },

    // Base + plugin presets that should apply to TS files
    extends: [
        // Base ESLint recommended rules
        js.configs.recommended,

        // ESLint plugin: de-morgan recommended rules
        pluginDeMorgan.configs.recommended,

        // ESLint plugin: unicorn recommended rules
        pluginUnicorn.configs.recommended,

        // ESLint plugin: promise recommended flat config
        pluginPromise.configs["flat/recommended"],

        // TypeScript aware linting (syntax + type checking)
        ...tseslint.configs.recommended,
        ...tseslint.configs.recommendedTypeChecked
    ],

    linterOptions: { reportUnusedDisableDirectives: true },

    // Needed for plugin rules
    plugins: {
        ...typeScriptPlugin,
        sonarjs: pluginSonarjs,
        security: pluginSecurity,
        import: pluginImport,
        regexp: pluginRegexp,
        boundaries: pluginBoundaries,
        "no-secrets": pluginNoSecrets,
        "eslint-comments": pluginEslintComments,
        "unused-imports": pluginUnusedImports
    },

    settings: {
        "import/resolver": {
            // TypeScript-aware resolver: maps ./foo.js → ./foo.ts in src
            typescript: tsImportResolver,
            node: { extensions: [".js", ".ts"] }
        },
        "boundaries/include": ["src/**/*.{ts,js}"],
        "boundaries/ignore": baseIgnorePatterns, // DO NOT put src/parser/generated/** here
        "boundaries/elements": [
            { type: "test", pattern: "src/**/test/**" }, // Put tests first to avoid matching other types
            { type: "core", pattern: "src/core/**" },
            { type: "parser", pattern: "src/parser/**" },
            { type: "parser-generated", pattern: "src/parser/generated/**" },
            { type: "transpiler", pattern: "src/transpiler/**" },
            { type: "semantic", pattern: "src/semantic/**" },
            { type: "plugin", pattern: "src/plugin/**" },
            { type: "refactor", pattern: "src/refactor/**" },
            { type: "runtime-wrapper", pattern: "src/runtime-wrapper/**" },
            { type: "cli", pattern: "src/cli/**" }
        ]
    },

    rules: {
        "no-unused-vars": "off",
        "unused-imports/no-unused-imports": "error",
        "unused-imports/no-unused-vars": [
            "warn",
            {
                vars: "all",
                varsIgnorePattern: "^_",
                args: "after-used",
                argsIgnorePattern: "^_"
            }
        ],
        "no-console": ["off"],
        "no-prototype-builtins": ["warn"],
        "no-useless-escape": ["warn"],
        "no-with": ["error"],
        "no-undef": ["error"],

        // built-in additions
        "no-shadow": "warn",
        "no-misleading-character-class": "error",
        "no-loss-of-precision": "error",
        "no-new-native-nonconstructor": "error",
        "prefer-regex-literals": "warn",

        /* --- Correctness / bug-prevention --- */
        "array-callback-return": ["error", { allowImplicit: true }], // map/filter/etc. must return
        "default-param-last": "error", // avoid surprising param order
        "dot-notation": "error", // prefer obj.prop over obj["prop"]
        "no-await-in-loop": "warn", // agents love to do this
        "no-constant-binary-expression": "error", // 1 + 2 === 3 style mistakes
        "no-constructor-return": "warn",
        "no-new-wrappers": "error", // new String(), etc.
        "no-promise-executor-return": "error", // returning inside new Promise((res) => ...)
        "no-self-compare": "error", // x === x is almost always a smell
        "no-unmodified-loop-condition": "warn", // loop condition never changes
        "no-unsafe-optional-chaining": "error", // e.g. foo?.bar()
        "prefer-object-has-own": "error", // use Object.hasOwn over hasOwnProperty
        "no-unassigned-vars": "error", // vars that are never assigned a value
        "no-useless-assignment": "error", // x = x;

        // --- Async / performance hygiene ---
        "require-await": "warn", // async fn must actually await
        "no-return-await": "warn", // return await → return (unless needed)
        "prefer-named-capture-group": "warn", // clearer regexes for agents

        // --- Maintainability / ergonomics ---
        "no-multi-assign": "error", // a = b = c; is hard to read
        "no-useless-catch": "error", // catch that just rethrows
        "no-useless-constructor": "error", // empty class constructors
        "no-useless-return": "error", // last line `return;`
        "object-shorthand": ["warn", "always"], // { foo: foo } → { foo }
        "prefer-const": ["error", { destructuring: "all" }], // stabilize bindings
        "no-var": "error", // always use let/const
        "prefer-template": "error", // "a " + b → `a ${b}`

        // --- Policy guard rails (blocks risky APIs at lint-time) ---
        "no-restricted-imports": [
            "error",
            {
                paths: [
                    {
                        name: "child_process",
                        message: "Use a vetted wrapper or remove."
                    },
                    { name: "vm", message: "Avoid sandbox foot-guns." }
                ],
                patterns: [
                    // block deep imports the agent might guess at:
                    "fs/*",
                    "path/*"
                ]
            }
        ],
        "no-restricted-globals": [
            "error",
            // common foot-gun in browser contexts; harmless in Node but cheap safeguard
            {
                name: "event",
                message: "Pass the event as a parameter instead."
            }
        ],

        /* --- core "bad practice" rules --- */
        complexity: ["error", { max: 70 }],
        "max-depth": ["error", 5],
        "max-lines": [
            "warn",
            {
                max: 600,
                skipBlankLines: true,
                skipComments: true
            }
        ],
        "max-lines-per-function": [
            "warn",
            {
                max: 150,
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
        "no-debugger": "error",
        "no-dupe-keys": "error",
        "no-dupe-else-if": "error",
        "no-duplicate-case": "error",
        "no-duplicate-imports": "error",
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
        "consistent-return": ["warn", { treatUndefinedAsUnspecified: true }],
        eqeqeq: ["warn", "always", { null: "ignore" }],
        "default-case-last": "error",
        radix: ["warn", "as-needed"],
        yoda: ["error", "never", { exceptRange: true }],

        // TypeScript
        // TODO: Raise some of these to "error" after fixing existing issues
        "@typescript-eslint/no-unsafe-assignment": "warn",
        "@typescript-eslint/no-unsafe-member-access": "warn",
        "@typescript-eslint/no-unsafe-return": "warn",
        "@typescript-eslint/no-unsafe-argument": "warn",
        "@typescript-eslint/no-unsafe-call": "warn",
        "@typescript-eslint/no-explicit-any": "warn",

        /* unicorn plugin tweaks beyond the preset */
        "unicorn/no-empty-file": "error",
        "unicorn/consistent-function-scoping": "warn",
        "unicorn/no-abusive-eslint-disable": "error",
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
        "sonarjs/no-identical-expressions": "error",
        "sonarjs/no-inverted-boolean-check": "error",
        "sonarjs/no-redundant-boolean": "error",
        "sonarjs/no-small-switch": "error",
        "sonarjs/declarations-in-global-scope": "off", // Disable for this project as module-level declarations are common and appropriate
        "sonarjs/no-unused-variables": "off", // covered by unused-imports/no-unused-vars
        "sonarjs/no-collapsible-if": "error",
        "sonarjs/no-implicit-dependencies": "error",
        "sonarjs/no-implicit-global": "error",
        "sonarjs/no-internal-api-use": "error",
        "sonarjs/no-ignored-return": "warn",
        "sonarjs/no-ignored-exceptions": "warn",
        "sonarjs/no-require-or-define": "error",
        "sonarjs/no-sonar-comments": "error",
        "sonarjs/prefer-immediate-return": "error",
        "sonarjs/strings-comparison": "error",

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
        "eslint-comments/no-unused-disable": "error",

        // Boundaries plugin (enforce architectural module boundaries)
        "boundaries/no-unknown": "error",
        "boundaries/entry-point": [
            2,
            {
                default: "disallow",
                rules: [
                    {
                        // set the required entry point name
                        target: [
                            "cli",
                            "core",
                            "parser",
                            "transpiler",
                            "semantic",
                            "plugin",
                            "refactor",
                            "runtime-wrapper"
                        ],
                        allow: ["index.ts", "index.js"]
                    }
                ]
            }
        ],
        "boundaries/element-types": [
            "error",
            {
                default: "disallow",
                rules: [
                    { from: "core", allow: ["core"] },
                    {
                        from: "parser",
                        allow: ["core", "parser", "parser-generated"]
                    },
                    {
                        from: "parser-generated",
                        allow: ["core", "parser-generated"]
                    },
                    { from: "transpiler", allow: ["core", "transpiler"] },
                    {
                        from: "semantic",
                        allow: ["core", "parser", "transpiler", "semantic"]
                    },
                    { from: "plugin", allow: ["core", "parser", "plugin"] },
                    {
                        from: "refactor",
                        allow: [
                            "core",
                            "parser",
                            "transpiler",
                            "semantic",
                            "refactor"
                        ]
                    },
                    {
                        from: "runtime-wrapper",
                        allow: [
                            "core",
                            "parser",
                            "transpiler",
                            "semantic",
                            "runtime-wrapper"
                        ]
                    },
                    {
                        from: "cli",
                        allow: ["core", "parser", "transpiler", "semantic"]
                    },
                    { from: "test", allow: ["*"] }
                ]
            }
        ]
    }
});

export default [
    {
        // Global ignores
        ignores: baseIgnorePatterns
    },

    // YAML: use the plugin’s flat preset (scoped to *.yml/*.yaml)
    {
        files: [".github/workflows/**/*.{yml,yaml}"],
        languageOptions: {
            parser: yamlParser
        },
        plugins: {
            yml: pluginYml
        },
        rules: {
            // start with recommended rules
            ...pluginYml.configs["flat/recommended"][0].rules,

            // workflows often use keys without values (e.g. `workflow_dispatch:`)
            "yml/no-empty-mapping-value": "off"
        }
    },

    // Disallow .mjs and .cjs files
    {
        files: ["**/*.mjs", "**/*.cjs"],
        rules: {
            // Block the entire file
            "no-restricted-syntax": [
                "error",
                {
                    selector: "Program",
                    message:
                        "Use .ts files only. .mjs and .cjs files are not allowed."
                }
            ]
        }
    },

    // All TS-related rules, presets, and overrides (scoped to **/*.ts)
    ...tsConfig,

    // Runtime-Wrapper allow eval (needed for patches for dynamic code execution)
    {
        files: ["src/runtime-wrapper/**"],
        plugins: {
            ...typeScriptPlugin
        },
        rules: {
            "@typescript-eslint/no-implied-eval": "off"
        }
    },

    // Localized TypeScript rule relaxations for files that trigger upstream
    // TypeScript lint engine bugs.
    {
        files: ["src/semantic/src/identifier-case/**/*.ts"],
        plugins: {
            ...typeScriptPlugin
        },
        rules: {
            "@typescript-eslint/no-unsafe-assignment": "off",
            "@typescript-eslint/no-unsafe-return": "off",
            "@typescript-eslint/no-unnecessary-type-assertion": "off"
        }
    },

    // Additional TypeScript rule relaxations for files that trigger overload signature issues
    {
        files: ["src/semantic/test/project-index-defaults.test.ts"],
        plugins: {
            ...typeScriptPlugin
        },
        rules: {
            "@typescript-eslint/no-floating-promises": "off",
            "@typescript-eslint/no-misused-promises": "off"
        }
    },

    // Tests: relax a few noisy limits
    // Goes AFTER the main ts config to override
    {
        files: ["**/test/**/*.ts", "**/*.test.ts", "**/*.spec.ts"],
        languageOptions: {
            parserOptions: {
                // Use specific project configuration instead of project service to avoid
                // TypeScript overload signature issues with node:test functions
                project: ["./tsconfig.eslint.json"]
            }
        },
        plugins: {
            ...typeScriptPlugin
        },
        rules: {
            quotes: ["off"],
            "max-lines-per-function": "off",
            "max-lines": "off",
            "max-statements": "off",
            "sonarjs/no-duplicate-string": "off",
            complexity: ["warn", { max: 35 }],
            "no-restricted-syntax": "off",
            "no-throw-literal": "warn",
            "require-await": "off",
            "boundaries/entry-point": "off",
            "unicorn/no-useless-undefined": "off",

            // TS-specific overrides:
            "@typescript-eslint/require-await": "off",
            "no-promise-executor-return": "off",
            "@typescript-eslint/no-floating-promises": "warn",
            "@typescript-eslint/no-unsafe-argument": "off",
            "@typescript-eslint/no-unsafe-call": "off",
            "@typescript-eslint/no-unsafe-member-access": "off",
            "@typescript-eslint/unbound-method": "warn",
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/no-unsafe-return": "off",
            "@typescript-eslint/no-unsafe-assignment": "off"
        }
    },

    // CLI: allow process.exit
    {
        files: ["src/cli/**"],
        rules: {
            "unicorn/no-process-exit": "off"
        }
    },

    // Place eslint-config-prettier last to prevent ESLint/Prettier fights
    eslintConfigPrettier
];
