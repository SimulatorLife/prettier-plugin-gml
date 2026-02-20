# @gml-modules/plugin

This directory contains the source code for the [gml-modules/plugin](https://github.com/gml-modules/plugin) package.

## Ownership Boundaries

The plugin workspace owns formatting and parser-to-printer orchestration *only* (semicolons, whitespaces, line breaks, indentation, etc.).

- The plugin **must not** depend directly on `@gml-modules/semantic`, `@gml-modules/refactor`, or `@gml-modules/lint`.
- Semantic/content rewrites, project-aware transformations, and 'fixes' (fixing/generating function doc-comments, transforming legacy `globalvar` declarations to use the `global` keyword, etc.) are lint auto-fix responsibilities in `@gml-modules/lint`.

## Test Tiering

- Plugin fixture/unit tests validate formatter-owned layout behavior.
- Project-aware behavior is validated in lint/CLI test suites; plugin tests do not validate semantic rewrite behavior.

## Plugin Architecture

### Constants ([`src/constants.ts`](src/constants.ts))

The plugin uses a centralized constants file to define formatting defaults and thresholds. This ensures consistency across the codebase and makes it easy to understand and maintain default values.

Key constants include:
- `DEFAULT_PRINT_WIDTH` (120): The default line width for code
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

## Formatter/Linter split (finalized)

The split is now contractually fixed:

- `@gml-modules/plugin` is formatter-only.
- Any semantic/content rewrite belongs to `@gml-modules/lint` rules and is applied via `lint --fix`.

Migration quick map:

- `globalvar` rewrites => `gml/no-globalvar` (lint)
- loop-hoist rewrites => `gml/prefer-loop-length-hoist` (lint)
- separator repair => `gml/require-argument-separators` (lint)
- doc-comment tag synthesis/normalization => `gml/normalize-doc-comments` (lint)
- indentation/wrapping/layout => plugin formatter

See the durable split contract and before/after examples in [`docs/formatter-linter-split-plan.md`](../../docs/formatter-linter-split-plan.md).
