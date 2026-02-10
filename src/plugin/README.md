# @gml-modules/plugin

This directory contains the source code for the [gml-modules/plugin](https://github.com/gml-modules/plugin) package.

## Ownership Boundaries

The plugin workspace owns formatting and parser-to-printer orchestration only.

- The plugin **must not** depend directly on `@gml-modules/semantic` or `@gml-modules/refactor`.
- Semantic-safe and refactor-aware behavior is exposed through runtime ports:
  - `setSemanticSafetyRuntime(...)`
  - `setRefactorRuntime(...)`
  - `setIdentifierCaseRuntime(...)`
- Concrete adapters are created in the integration/composition root (CLI) and injected into the plugin at runtime.

This keeps formatter-only usage lightweight while still allowing project-aware rename planning when an integration host provides adapters.

## Test Tiering

- Plugin fixture/unit tests validate local formatter behavior and local-safe fallback behavior.
- Project-aware rename behavior (for example `preserveGlobalVarStatements: false` when cross-file symbols exist) is validated in integration tests that build a temporary project and inject runtime adapters through CLI wiring.

## Plugin Architecture

### Constants (`src/constants.ts`)

The plugin uses a centralized constants file to define formatting defaults and thresholds. This ensures consistency across the codebase and makes it easy to understand and maintain default values.

Key constants include:
- `DEFAULT_PRINT_WIDTH` (120): The default line width for code and documentation
- `DEFAULT_TAB_WIDTH` (4): The default indentation width
- `DEFAULT_VARIABLE_BLOCK_SPACING_MIN_DECLARATIONS` (4): Minimum declarations to trigger spacing

These constants are used throughout the plugin to ensure consistent behavior. Users can override formatting defaults through Prettier's standard options (e.g., `printWidth`, `tabWidth`).

## Formatting Conventions
- Prettier always formats functions with a space before the parameter list `function (o) {}`, but never for function calls `fn(o)`. This behavior is fixed and not configurable. For a function name and its parameter list (e.g. `function foo(x) {}`) Prettier does NOT add a space. We should use the same style/convention in this plugin.
- Comments are never broken up or reflowed to fit the `printWidth` setting. This aligns with Prettier's default behavior for comments, preserving the developer's original line structure and preventing unintended corruption of commented-out code or manual formatting.

## Deprecated And Removed Options
- `maxStructPropertiesPerLine` was removed on February 7, 2026.
- Why it was removed: struct layout is now fully opinionated and consistent with Prettier defaults, so struct wrapping is controlled by document shape and `printWidth` rather than a custom numeric threshold.
- Migration: remove `maxStructPropertiesPerLine` from configuration files; no replacement option is provided.
- `maxParamsPerLine` was removed on February 7, 2026.
- Why it was removed: argument layout now follows Prettier-style default wrapping with `printWidth` and document shape, without numeric argument-count thresholds.
- Migration: remove `maxParamsPerLine` from configuration files; no replacement option is provided.

## TODO
1. Add support for the following Prettier options: 1) `bracketSameLine`, 2) `bracketSpacing`, 3) `semi`, 4) `useTabs`, 5) `tabWidth`.
2. Split Prettier plugin into a formatter-only package and a separate feather-fixer/linter package that includes fixes that require project-aware scope analysis (e.g., `preserveGlobalVarStatements: false` when cross-file symbols exist). See [docs/formatter-linter-split-plan.md](../../docs/formatter-linter-split-plan.md) for details and the plan.
