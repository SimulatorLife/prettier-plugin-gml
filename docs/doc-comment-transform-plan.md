# Doc-Comment Ownership Plan (Post Split)

## Status (2026-02-17)

This document supersedes the older plugin-centered doc-comment transform plan.
The formatter/linter split is now the source of truth for ownership:

- `@gml-modules/lint` owns doc-comment content rewrites and synthetic tag generation.
- `@gml-modules/plugin` owns layout-only printing and must not synthesize or normalize doc-comment content.
- `@gml-modules/core` owns reusable doc-comment parsing/metadata utilities.

Canonical contract reference: `docs/formatter-linter-split-plan.md`.

## Target Ownership

1. Lint (`gml/normalize-doc-comments`) owns:
- legacy prefix/tag normalization (`// @tag`, `// /` forms)
- `@description` promotion/cleanup
- function-doc tag synthesis (`@description`, `@param`, `@returns`)

2. Plugin owns:
- rendering and spacing of already-existing/normalized doc comments
- comment placement/layout that does not change text content

3. Core owns:
- shared doc-comment helpers used by lint/plugin
- AST metadata utilities and normalization primitives

## Migration Rules

1. Do not add new doc-comment content mutation logic in plugin printer/transforms.
2. Any new doc-comment synthesis or tag/content rewrite must be implemented as lint rule behavior (or an expansion of `gml/normalize-doc-comments`).
3. Plugin regressions should assert formatter non-mutation boundaries; rewrite behavior must be covered in lint tests.

## Current Enforcement

- Formatter synthetic-doc runtime payload emission is disabled in plugin (`src/plugin/src/printer/doc-comment/synthetic-doc-comment-builder.ts`).
- Lint `normalize-doc-comments` tests cover synthetic function-doc generation and doc-prefix normalization.
- Plugin semantic doc-comment transform test ownership has been moved to lint coverage.

## Follow-ups

1. Keep doc-comment-related docs/tests synchronized with `docs/formatter-linter-split-plan.md` and `docs/formatter-linter-split-implementation-notes.md`.
2. When adding doc-comment behavior, update lint rule contract tests and fixture coverage first; only then adjust formatter regression tests as needed.
