# Failing Fixture Audit

Snapshot from `pnpm run test:fixtures` on March 13, 2026.

Current status:
- Total failing fixtures: `32`
- Format fixtures: `3`
- Lint fixtures: `16`
- Integration fixtures: `13`

Audit verdict summary:
- Likely real behavior regressions: `11`
- Likely stale, misconfigured, or otherwise incorrect fixture expectations: `21`

## Format workspace (`@gmloop/format`)

These are formatter golden fixtures under `src/format/test/fixtures/`.

| Fixture | Failure | Audit verdict | Relevant files |
| --- | --- | --- | --- |
| `test-operators` | Output differs only by an extra blank line before `#region`. | Fixture looks correct. This is a formatter layout regression, not a bad expectation. | [gmloop.json](../src/format/test/fixtures/test-operators/gmloop.json), [expected.gml](../src/format/test/fixtures/test-operators/expected.gml) |
| `test-preserve` | Output differs by an extra blank line before `global.lighting.draw(...)`. | Fixture looks correct. This is a formatter layout regression. | [gmloop.json](../src/format/test/fixtures/test-preserve/gmloop.json), [expected.gml](../src/format/test/fixtures/test-preserve/expected.gml) |
| `test-structs` | Output differs by an extra blank line before `global.camera.punch(...)`. | Fixture looks correct. This is a formatter layout regression. | [gmloop.json](../src/format/test/fixtures/test-structs/gmloop.json), [expected.gml](../src/format/test/fixtures/test-structs/expected.gml) |

## Lint workspace (`@gmloop/lint`)

These are lint autofix fixtures under `src/lint/test/fixtures/`.

| Fixture | Failure | Audit verdict | Relevant files |
| --- | --- | --- | --- |
| `feather/gm1003` | Autofix converts enum string numbers to integers. | Fixture looks correct. The autofix is mutating unrelated syntax and appears buggy. | [input.gml](../src/lint/test/fixtures/feather/gm1003/input.gml), [expected.gml](../src/lint/test/fixtures/feather/gm1003/expected.gml), [Feather rule factory](../src/lint/src/rules/feather/create-feather-rule.ts) |
| `feather/gm1007` | Fixture fails during parsing on invalid assignments like `new Point(...) = 1`, `1 = ...`, and `= 10;`. | Fixture setup looks incorrect under the current parse-first lint architecture. The rule never gets a chance to run. | [input.gml](../src/lint/test/fixtures/feather/gm1007/input.gml), [gmloop.json](../src/lint/test/fixtures/feather/gm1007/gmloop.json), [Feather rule factory](../src/lint/src/rules/feather/create-feather-rule.ts) |
| `feather/gm1012` | Fixture fails during parsing on `.length` member access. | Fixture setup looks incorrect or stale under the current parser and lint pipeline. It assumes pre-parse rewriting. | [input.gml](../src/lint/test/fixtures/feather/gm1012/input.gml), [gmloop.json](../src/lint/test/fixtures/feather/gm1012/gmloop.json), [Feather rule factory](../src/lint/src/rules/feather/create-feather-rule.ts) |
| `feather/gm1034` | Fixture fails during parsing because the input is missing a closing brace. | Fixture input is malformed. This is a fixture setup problem. | [input.gml](../src/lint/test/fixtures/feather/gm1034/input.gml), [gmloop.json](../src/lint/test/fixtures/feather/gm1034/gmloop.json), [Feather rule factory](../src/lint/src/rules/feather/create-feather-rule.ts) |
| `feather/gm1058` | Autofix inserts `constructor` in a way that produces invalid code for the parser or downstream formatting. | Fixture looks correct. The autofix behavior appears wrong. | [input.gml](../src/lint/test/fixtures/feather/gm1058/input.gml), [gmloop.json](../src/lint/test/fixtures/feather/gm1058/gmloop.json), [Feather rule factory](../src/lint/src/rules/feather/create-feather-rule.ts) |
| `feather/gm1100` | Fixture fails during parsing on invalid lines like `_this * something;` and `= 48;`. | Fixture setup looks incorrect under the current parse-first lint model. | [input.gml](../src/lint/test/fixtures/feather/gm1100/input.gml), [gmloop.json](../src/lint/test/fixtures/feather/gm1100/gmloop.json), [Feather rule factory](../src/lint/src/rules/feather/create-feather-rule.ts) |
| `feather/gm2031` | Autofix inserts `file_find_close();` repeatedly instead of only once. | Fixture looks correct. The autofix is non-idempotent or applying too broadly. | [input.gml](../src/lint/test/fixtures/feather/gm2031/input.gml), [expected.gml](../src/lint/test/fixtures/feather/gm2031/expected.gml), [Feather rule factory](../src/lint/src/rules/feather/create-feather-rule.ts) |
| `feather/gm2044` | Autofix duplicates `/// @returns {undefined}` many times. | Fixture looks correct. The autofix is non-idempotent or repeatedly reapplying its own output. | [input.gml](../src/lint/test/fixtures/feather/gm2044/input.gml), [expected.gml](../src/lint/test/fixtures/feather/gm2044/expected.gml), [Feather rule factory](../src/lint/src/rules/feather/create-feather-rule.ts) |
| `no-assignment-in-condition` | Fixture fails during parsing on `if (counter += 1)`. | Fixture setup looks incorrect under the current parser-based lint path because the parser rejects this before the rule can rewrite it. | [input.gml](../src/lint/test/fixtures/no-assignment-in-condition/input.gml), [expected.gml](../src/lint/test/fixtures/no-assignment-in-condition/expected.gml), [rule](../src/lint/src/rules/gml/rules/no-assignment-in-condition-rule.ts) |
| `no-globalvar` | Only diff is formatter-added braces around `if (should_exit()) return;`. | The expectation is directionally correct, but the fixture is not truly idempotent once lint output is post-formatted. This is more a fixture-harness mismatch than a rule bug. | [input.gml](../src/lint/test/fixtures/no-globalvar/input.gml), [gmloop.json](../src/lint/test/fixtures/no-globalvar/gmloop.json), [rule](../src/lint/src/rules/gml/rules/no-globalvar-rule.ts), [lint fixture adapter](../src/lint/test/rules/fixture-adapter.ts) |
| `normalize-directives` | Actual output drops the invalid line `#define 123 not valid`, while expected preserves it. | Fixture looks correct. Dropping unrecognized directive text is too destructive for a normalizer. | [input.gml](../src/lint/test/fixtures/normalize-directives/input.gml), [expected.gml](../src/lint/test/fixtures/normalize-directives/expected.gml), [rule](../src/lint/src/rules/gml/rules/normalize-directives-rule.ts) |
| `normalize-doc-comments` | Actual output duplicates large doc sections and repeats transformed content. | Fixture looks correct. The autofix is clearly broken or non-idempotent. | [input.gml](../src/lint/test/fixtures/normalize-doc-comments/input.gml), [expected.gml](../src/lint/test/fixtures/normalize-doc-comments/expected.gml), [rule](../src/lint/src/rules/gml/rules/normalize-doc-comments-rule.ts) |
| `normalize-operator-aliases` | Fixture fails during parsing on uppercase `AND`, `NOT`, `OR`, `XOR`. | Fixture setup looks stale or incompatible with the current parser-first pipeline unless this rule is meant to run pre-parse. | [input.gml](../src/lint/test/fixtures/normalize-operator-aliases/input.gml), [gmloop.json](../src/lint/test/fixtures/normalize-operator-aliases/gmloop.json), [rule](../src/lint/src/rules/gml/rules/normalize-operator-aliases-rule.ts) |
| `optimize-logical-flow` | Logical rewrites happen, but final output uses `and/or` where expected uses `&&/||`. | The fixture is likely misconfigured or over-specified. It is asserting operator-style output in a lint fixture that is post-formatted. | [input.gml](../src/lint/test/fixtures/optimize-logical-flow/input.gml), [expected.gml](../src/lint/test/fixtures/optimize-logical-flow/expected.gml), [rule](../src/lint/src/rules/gml/rules/optimize-logical-flow-rule.ts), [lint fixture adapter](../src/lint/test/rules/fixture-adapter.ts) |
| `require-argument-separators` | Fixture fails during parsing on `show_debug_message_ext(name payload);`. | Fixture setup looks incorrect under the current parse-first lint model. | [input.gml](../src/lint/test/fixtures/require-argument-separators/input.gml), [gmloop.json](../src/lint/test/fixtures/require-argument-separators/gmloop.json), [rule](../src/lint/src/rules/gml/rules/require-argument-separators-rule.ts) |
| `require-control-flow-braces` | Final output misses the semicolon in the first newly braced block. | Fixture looks correct. This is a real output bug in the formatter-plus-lint path. | [input.gml](../src/lint/test/fixtures/require-control-flow-braces/input.gml), [expected.gml](../src/lint/test/fixtures/require-control-flow-braces/expected.gml), [rule](../src/lint/src/rules/gml/rules/require-control-flow-braces-rule.ts), [lint fixture adapter](../src/lint/test/rules/fixture-adapter.ts) |

## Integration workspace (root cross-module integration fixtures)

These are end-to-end fixtures under `test/fixtures/integration/`. They exercise formatting plus selected lint rules together.

| Fixture | Failure | Audit verdict | Relevant files |
| --- | --- | --- | --- |
| `test-int-comments-ops` | Actual output aggressively normalizes comments, doc formatting, operator spelling, and decorative comments beyond what the golden expects. | Expected output looks stale relative to the currently enabled rules. | [gmloop.json](../test/fixtures/integration/test-int-comments-ops/gmloop.json), [input.gml](../test/fixtures/integration/test-int-comments-ops/input.gml), [expected.gml](../test/fixtures/integration/test-int-comments-ops/expected.gml), [integration adapter](../test/integration-fixture-adapter.ts) |
| `test-int-doc-banner` | Actual output rewrites banner comments and math expressions more aggressively than the golden expects. | Expected output looks stale. | [gmloop.json](../test/fixtures/integration/test-int-doc-banner/gmloop.json), [input.gml](../test/fixtures/integration/test-int-doc-banner/input.gml), [expected.gml](../test/fixtures/integration/test-int-doc-banner/expected.gml), [integration adapter](../test/integration-fixture-adapter.ts) |
| `test-int-flow-hoist` | Fixture fails before execution because `gmloop.json` sets `gml/prefer-hoistable-loop-accessors` to an array instead of `"off"`, `"warn"`, or `"error"`. | Fixture config is incorrect. | [gmloop.json](../test/fixtures/integration/test-int-flow-hoist/gmloop.json), [integration adapter](../test/integration-fixture-adapter.ts) |
| `test-int-format-strings` | Actual output keeps string interpolation and restructures control flow, while expected preserves older string literal and early-return forms. | Expected output looks stale relative to the enabled rules. | [gmloop.json](../test/fixtures/integration/test-int-format-strings/gmloop.json), [input.gml](../test/fixtures/integration/test-int-format-strings/input.gml), [expected.gml](../test/fixtures/integration/test-int-format-strings/expected.gml), [prefer-string-interpolation rule](../src/lint/src/rules/gml/rules/prefer-string-interpolation-rule.ts) |
| `test-int-func-rules` | Actual output applies many enabled-rule rewrites that the golden does not reflect, including default handling, undefined checks, argument handling, and doc normalization. | Expected output looks stale or under-normalized for the configured rule set. | [gmloop.json](../test/fixtures/integration/test-int-func-rules/gmloop.json), [input.gml](../test/fixtures/integration/test-int-func-rules/input.gml), [expected.gml](../test/fixtures/integration/test-int-func-rules/expected.gml) |
| `test-int-logic-flow` | Expected output assumes much stronger boolean-algebra simplification than current behavior performs. | Expected output likely stale or too aggressive. | [gmloop.json](../test/fixtures/integration/test-int-logic-flow/gmloop.json), [input.gml](../test/fixtures/integration/test-int-logic-flow/input.gml), [expected.gml](../test/fixtures/integration/test-int-logic-flow/expected.gml), [optimize-logical-flow rule](../src/lint/src/rules/gml/rules/optimize-logical-flow-rule.ts) |
| `test-int-manual-math` | Actual output prefers `dsin/dcos/dtan` and preserves a multiplication split by an inline comment, while expected wants older `sin(degtorad(...))` forms and `sqr(value)`. | Expected output looks stale. | [gmloop.json](../test/fixtures/integration/test-int-manual-math/gmloop.json), [input.gml](../test/fixtures/integration/test-int-manual-math/input.gml), [expected.gml](../test/fixtures/integration/test-int-manual-math/expected.gml), [optimize-math-expressions rule](../src/lint/src/rules/gml/rules/optimize-math-expressions-rule.ts) |
| `test-int-math-docs` | Expected output over-optimizes many expressions and even expects `myStruct[]` instead of the keyed access present in actual output. | Expected output looks incorrect or stale. | [gmloop.json](../test/fixtures/integration/test-int-math-docs/gmloop.json), [input.gml](../test/fixtures/integration/test-int-math-docs/input.gml), [expected.gml](../test/fixtures/integration/test-int-math-docs/expected.gml), [optimize-math-expressions rule](../src/lint/src/rules/gml/rules/optimize-math-expressions-rule.ts) |
| `test-int-math-nested` | Only remaining differences are redundant parentheses around multiplicative expressions. | Expected output looks stale or too specific about harmless grouping. | [gmloop.json](../test/fixtures/integration/test-int-math-nested/gmloop.json), [input.gml](../test/fixtures/integration/test-int-math-nested/input.gml), [expected.gml](../test/fixtures/integration/test-int-math-nested/expected.gml), [optimize-math-expressions rule](../src/lint/src/rules/gml/rules/optimize-math-expressions-rule.ts) |
| `test-int-newlines` | Actual output adds one extra blank line before `repeat (to_spawn)`. | Fixture looks correct. This is a formatter newline regression. | [gmloop.json](../test/fixtures/integration/test-int-newlines/gmloop.json), [input.gml](../test/fixtures/integration/test-int-newlines/input.gml), [integration adapter](../test/integration-fixture-adapter.ts) |
| `test-int-no-globalvar` | Expected output rewrites `globalvar` declarations into `global.*` assignments, but current `gml/no-globalvar` is diagnostic-only and does not fix. | Expected output is stale for the current rule behavior. | [gmloop.json](../test/fixtures/integration/test-int-no-globalvar/gmloop.json), [input.gml](../test/fixtures/integration/test-int-no-globalvar/input.gml), [expected.gml](../test/fixtures/integration/test-int-no-globalvar/expected.gml), [no-globalvar rule](../src/lint/src/rules/gml/rules/no-globalvar-rule.ts) |
| `test-int-ops-logic` | Expected output assumes constant-folding and algebraic rewrites that the configured rules do not currently perform. | Expected output looks stale or incorrect. | [gmloop.json](../test/fixtures/integration/test-int-ops-logic/gmloop.json), [input.gml](../test/fixtures/integration/test-int-ops-logic/input.gml), [expected.gml](../test/fixtures/integration/test-int-ops-logic/expected.gml), [optimize-logical-flow rule](../src/lint/src/rules/gml/rules/optimize-logical-flow-rule.ts), [optimize-math-expressions rule](../src/lint/src/rules/gml/rules/optimize-math-expressions-rule.ts) |
| `test-int-strings.input-copy` | Fixture is marked `idempotent`, but the input is plainly not formatter-idempotent. It still contains legacy string layout, extra semicolons, and multiline interpolation formatting that current formatting rewrites. | Fixture setup is incorrect. | [gmloop.json](../test/fixtures/integration/test-int-strings.input-copy/gmloop.json), [input.gml](../test/fixtures/integration/test-int-strings.input-copy/input.gml), [integration adapter](../test/integration-fixture-adapter.ts) |

## Most Important Patterns

1. Several lint fixtures are no longer compatible with the current parser-first execution path.
   Fixtures such as `feather/gm1007`, `feather/gm1012`, `feather/gm1100`, `no-assignment-in-condition`, `normalize-operator-aliases`, and `require-argument-separators` rely on source text that the parser rejects before ESLint rules can apply fixes.

2. Several Feather and GML autofixes are non-idempotent.
   The clearest examples are `feather/gm2031`, `feather/gm2044`, and `normalize-doc-comments`.

3. The remaining format fixture failures are all narrow blank-line regressions.
   `test-operators`, `test-preserve`, `test-structs`, and the integration case `test-int-newlines` all fall into this bucket.

4. A large share of the integration goldens look stale relative to the currently enabled formatter and lint behavior.
   The clearest cases are `test-int-no-globalvar`, `test-int-ops-logic`, `test-int-math-docs`, `test-int-manual-math`, and `test-int-strings.input-copy`.

## Concrete Source Notes

- [`gml/no-globalvar`](../src/lint/src/rules/gml/rules/no-globalvar-rule.ts) is currently diagnostic-only and does not implement an autofix, so any fixture expecting `globalvar` to become `global.<name>` is out of date.
- [`gml/require-control-flow-braces`](../src/lint/src/rules/gml/rules/require-control-flow-braces-rule.ts) is diagnostic-only and depends on the formatter to produce the final braced layout, so semicolon or blank-line mismatches in those fixtures are formatter-path problems.
- The [lint fixture harness](../src/lint/test/rules/fixture-adapter.ts) post-formats lint output, so some lint fixtures are implicitly asserting formatter style in addition to rule behavior.
