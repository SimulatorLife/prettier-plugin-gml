# Doc-Comment Prettier Conversion Notes (Formatter-Only Scope)

## Scope

These notes apply only to formatter-owned doc-comment rendering behavior.
Content rewrites and synthetic tag generation are lint-owned (`gml/normalize-doc-comments`).

## Objective

Use Prettier doc builders for layout/wrapping of already-normalized `/// @description` content so formatter output stays deterministic without introducing custom string-reflow logic.

## Ownership Boundaries

1. Plugin may:
- wrap and indent doc-comment lines for layout
- preserve developer-authored line structure where required by formatter policy

2. Plugin may not:
- synthesize missing doc tags
- normalize legacy comment prefixes/tags
- mutate doc-comment semantic content

3. Lint owns all semantic doc-comment rewrites:
- `@description` promotion
- `@param`/`@returns` synthesis
- legacy `//` doc canonicalization

## Validation

1. Run plugin tests for formatter behavior:
- `pnpm --filter @gml-modules/plugin test`

2. Run lint tests for doc-comment rewrite behavior:
- `pnpm --filter @gml-modules/lint test`

3. Keep fixture ownership split intact:
- formatter fixtures assert layout only
- lint fixtures/tests assert doc-comment rewrites
