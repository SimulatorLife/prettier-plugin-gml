# Lint performance notes

## `gml/optimize-math-expressions` fast path

On **March 7, 2026**, lint profiling identified `gml/optimize-math-expressions` as the slowest auto-fix rule across the lint fixture corpus.

A targeted optimization now short-circuits a common high-volume pattern:

- `a*b + c*d` -> `dot_product(a, c, b, d)`
- `a*b + c*d + e*f` -> `dot_product_3d(a, c, e, b, d, f)`

The fast path avoids the full manual normalization pipeline for these shapes, reducing deep-clone overhead while preserving fix output.

## How it was profiled

Rule-level timing (ESLint stats):

```bash
node --input-type=module <<'EOF'
import { ESLint } from "eslint";
import * as LintWorkspace from "@gml-modules/lint";

const eslint = new ESLint({
  overrideConfigFile: true,
  fix: true,
  stats: true,
  overrideConfig: LintWorkspace.Lint.configs.recommended
});

const results = await eslint.lintFiles(["src/lint/test/fixtures/**/*.gml"]);
const ruleTotals = new Map();
for (const result of results) {
  for (const pass of result.stats?.times?.passes ?? []) {
    for (const [ruleId, metrics] of Object.entries(pass.rules ?? {})) {
      ruleTotals.set(ruleId, (ruleTotals.get(ruleId) ?? 0) + (metrics.total ?? 0));
    }
  }
}

console.log([...ruleTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10));
EOF
```

CPU profiling on a large synthetic dot-product batch showed clone-heavy normalization as the hot path (`structuredClone` dominated samples).

## Measured impact

Synthetic benchmark (`result_i = a_i*b_i + c_i*d_i + e_i*f_i`) with ESLint `stats: true`:

- 500 statements: ~294ms -> ~53ms rule time
- 1000 statements: ~545ms -> ~80ms rule time
- 1500 statements: ~824ms -> ~113ms rule time

## Regression coverage

Correctness coverage:

- `src/lint/test/rules/optimize-math-expressions-fast-path.test.ts`

Performance coverage:

- `src/lint/test/rules/performance-regression.test.ts`

These tests run in the normal lint workspace test suite (`pnpm test`, `pnpm test:ci`), so CI executes both correctness and performance checks for this optimization.

## `gml/prefer-loop-invariant-expressions` local hoist-name fast path

On **March 7, 2026**, profiling of a large real-world SMF script highlighted hoist-name collision handling as a secondary hot path for `gml/prefer-loop-invariant-expressions`.

Lint now keeps this rule strictly single-file:

- hoist-name resolution only considers identifiers already declared in the current file,
- the rule reuses its precomputed normalized local identifier set,
- collision-heavy files avoid repeated $O(n)$ renormalization work for `cached_value[_N]` candidates.

Project-wide identifier indexing and cross-file safety checks belong in `@gml-modules/refactor`, not in the lint workspace.

### Regression coverage

Correctness coverage:

- `src/lint/test/rules/prefer-loop-invariant-expressions-rule.test.ts`

Performance coverage:

- `src/lint/test/rules/performance-regression.test.ts`

These tests run in the standard lint workspace suite, so CI now guards both the hoist-name correctness path and the collision-heavy single-file performance path.
