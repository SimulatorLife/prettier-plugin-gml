# @gml-modules/plugin

This directory contains the source code for the [gml-modules/plugin](https://github.com/gml-modules/plugin) package.

## Plugin Architecture

### Constants (`src/constants.ts`)

The plugin uses a centralized constants file to define formatting defaults and thresholds. This ensures consistency across the codebase and makes it easy to understand and maintain default values.

Key constants include:
- `DEFAULT_PRINT_WIDTH` (120): The default line width for code and documentation
- `DEFAULT_TAB_WIDTH` (4): The default indentation width
- `DEFAULT_ALIGN_ASSIGNMENTS_MIN_GROUP_SIZE` (3): Minimum assignments needed for alignment
- `DEFAULT_VARIABLE_BLOCK_SPACING_MIN_DECLARATIONS` (4): Minimum declarations to trigger spacing

These constants are used throughout the plugin to ensure consistent behavior. Users can override formatting defaults through Prettier's standard options (e.g., `printWidth`, `tabWidth`).

## Formatting Conventions
- Prettier always formats functions with a space before the parameter list `function (o) {}`, but never for function calls `fn(o)`. This behavior is fixed and not configurable. For a function name and its parameter list (e.g. `function foo(x) {}`) Prettier does NOT add a space. We should use the same style/convention in this plugin.
- Comments are never broken up or reflowed to fit the `printWidth` setting. This aligns with Prettier's default behavior for comments, preserving the developer's original line structure and preventing unintended corruption of commented-out code or manual formatting.

## TODO
- Remove option `maxParamsPerLine`; we should use Prettier's default behavior instead.