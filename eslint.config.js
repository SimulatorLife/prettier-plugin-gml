import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: [
      "node_modules/*",
      "build/*",
      "src/vendor/*.js",
      "generated/*",
      "src/parser/src/generated/**/*",
    ],
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      indent: ["error", 4, { SwitchCase: 1 }],
      quotes: ["warn", "double"],
      semi: ["error", "always"],
      "no-unused-vars": ["warn"],
      "no-console": ["off"],
      "comma-dangle": ["error", "never"],
      "no-prototype-builtins": ["off"],
      "no-useless-escape": ["off"],
    },
  },
  {
    files: ["src/plugin/src/printer/print.js"],
    rules: {
      "no-undef": ["off"],
    },
  },
  {
    files: ["src/parser/tests/**/*.js"],
    rules: {
      indent: ["error", 2],
      quotes: ["off"],
      "comma-dangle": ["off"],
      "no-unused-vars": [
        "warn",
        { args: "after-used", argsIgnorePattern: "^_" },
      ],
    },
  },
];
