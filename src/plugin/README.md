# @gml-modules/plugin

This directory contains the source code for the [gml-modules/plugin](https://github.com/gml-modules/plugin) package.

## Formatting Conventions
- Prettier always formats functions with a space before the parameter list `function (o) {}`, but never for function calls `fn(o)`. This behavior is fixed and not configurable. For a function name and its parameter list (e.g. `function foo(x) {}`) Prettier does NOT add a space. We should use the same style/convention in this plugin.
- Comments are never broken up or reflowed to fit the `printWidth` setting. This aligns with Prettier's default behavior for comments, preserving the developer's original line structure and preventing unintended corruption of commented-out code or manual formatting.