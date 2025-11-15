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
import pluginUnusedImports from "eslint-plugin-unused-imports";
import deMorgan from "eslint-plugin-de-morgan";
import pluginYml from "eslint-plugin-yml";

/* Config */
import eslintConfigPrettier from "eslint-config-prettier";

export default [
    {
        ignores: [
            "node_modules/*",
            "build/*",
            "*.md",
            "*antlr/*",
            "resources/*",
            "vendor/*",
            "dist/*",
            "reports/*",
            "src/vendor/*.js",
            "src/parser/generated/**/*",
            "*.gml",
            ".DS_Store",
            "LICENSE",
            // NOTE: Do not ignore `.github/**` here because we want to lint
            // workflow YAML files (GH Actions) with eslint-plugin-yml. Workflows
            // are validated by the YAML rule set defined below (files: **/*.yml)
            // Removing the blanket ignore allows the `.github/*.yml` files to
            // be picked up by `npm run lint:yaml` and by CI checks.
            "*.g4",
            "tmp/*"
        ]
    },

    /* Base ESLint recommended */
    js.configs.recommended,

    /* ESLint plugin: de-morgan recommended rules. */
    deMorgan.configs.recommended,

    /* ESLint plugin: unicorn recommended rules.
     * This brings in { plugins: { unicorn: … }, rules: { unicorn/* … } } */
    pluginUnicorn.configs.recommended,

    pluginPromise.configs["flat/recommended"],

    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: {
                ...globals.node
            }
        },
        linterOptions: { reportUnusedDisableDirectives: true },

        /* Needed for plugin rules */
        plugins: {
            sonarjs: pluginSonarjs,
            security: pluginSecurity,
            import: pluginImport,
            regexp: pluginRegexp,
            "no-secrets": pluginNoSecrets,
            "eslint-comments": pluginEslintComments,
            "unused-imports": pluginUnusedImports
        },

        /* Helpful for import/plugin-import */
        settings: {
            "import/resolver": {
                node: { extensions: [".js"] }
            }
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
            complexity: ["warn", { max: 12 }],
            "max-depth": ["warn", 3],
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
            "sonarjs/declarations-in-global-scope": "warn",
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
            "eslint-comments/no-unused-disable": "error"
        }
    },

    // YAML: use the plugin’s flat preset (scoped to *.yml/*.yaml)
    ...pluginYml.configs["flat/recommended"],
    {
        files: [".github/workflows/**"],
        rules: {
            // workflows often use keys without values (e.g. `workflow_dispatch:`)
            "yml/no-empty-mapping-value": "off"
        }
    },

    /* Disallow .mjs and .cjs files */
    {
        files: ["**/*.mjs", "**/*.cjs"],
        rules: {
            // Block the entire file
            "no-restricted-syntax": [
                "error",
                {
                    selector: "Program",
                    message:
                        "Use .js files only. .mjs and .cjs files are not allowed."
                }
            ]
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
        files: ["**/test/**", "*.test.*js", "*.spec.js"],
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
            "no-promise-executor-return": "off"
        }
    },

    /* Place eslint-config-prettier last to prevent ESLint/Prettier fights */
    eslintConfigPrettier
];
