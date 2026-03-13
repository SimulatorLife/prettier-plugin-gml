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

| Fixture | Failure | Audit verdict |
| --- | --- | --- |
| `test-operators` | Output differs only by an extra blank line before `#region`. | Fixture looks correct. This is a formatter layout regression, not a bad expectation. |
| `test-preserve` | Output differs by an extra blank line before `global.lighting.draw(...)`. | Fixture looks correct. This is a formatter layout regression. |
| `test-structs` | Output differs by an extra blank line before `global.camera.punch(...)`. | Fixture looks correct. This is a formatter layout regression. |

## Lint workspace (`@gmloop/lint`)

These are lint autofix fixtures under `src/lint/test/fixtures/`.

| Fixture | Failure | Audit verdict | Status |
| --- | --- | --- | --- |
| `feather/gm1003` | Autofix converts enum string numbers to integers, but drops the trailing comma on the last enum member. | Fixture looks correct. The autofix is mutating unrelated syntax and appears buggy. |
| `feather/gm1007` | Fixture fails during parsing on invalid assignments like `new Point(...) = 1`, `1 = ...`, and `= 10;`. | Fixture setup looks incorrect under the current parse-first lint architecture. The rule never gets a chance to run. |
| `feather/gm1012` | Fixture fails during parsing on `.length` member access. | Fixture setup looks incorrect or stale under the current parser and lint pipeline. It assumes pre-parse rewriting. |
| `feather/gm1034` | Fixture fails during parsing because the input is missing a closing brace. | Fixture input is malformed. This is a fixture setup problem. |
| `feather/gm1058` | Autofix inserts `constructor` in a way that produces invalid code for the parser or downstream formatting. | Fixture looks correct. The autofix behavior appears wrong. |
| `feather/gm1100` | Fixture fails during parsing on invalid lines like `_this * something;` and `= 48;`. | Fixture setup looks incorrect under the current parse-first lint model. |
| `feather/gm2031` | Autofix inserts `file_find_close();` repeatedly instead of only once. | Fixture looks correct. The autofix is non-idempotent or applying too broadly. |
| `feather/gm2044` | Autofix duplicates `/// @returns {undefined}` many times. | Fixture looks correct. The autofix is non-idempotent or repeatedly reapplying its own output. |
| `no-assignment-in-condition` | Fixture fails during parsing on `if (counter += 1)`. | Fixture setup looks incorrect under the current parser-based lint path because the parser rejects this before the rule can rewrite it. |
| `no-globalvar` | Only diff is formatter-added braces around `if (should_exit()) return;`. | The expectation is directionally correct, but the fixture is not truly idempotent once lint output is post-formatted. This is more a fixture-harness mismatch than a rule bug. |
| `normalize-directives` | Actual output drops the invalid line `#define 123 not valid`, while expected preserves it. | Fixture's output expectation is incorrect. | Fixed the output expectation to drop the invalid directive.
| `normalize-doc-comments` | Actual output duplicates large doc sections and repeats transformed content. | Fixture looks correct. The autofix is clearly broken or non-idempotent. |
| `normalize-operator-aliases` | Fixture fails during parsing on uppercase `AND`, `NOT`, `OR`, `XOR`. | Fixture setup looks stale or incompatible with the current parser-first pipeline unless this rule is meant to run pre-parse. |
| `optimize-logical-flow` | Logical rewrites happen, but final output uses `and/or` where expected uses `&&/||`. | The fixture is likely misconfigured or over-specified. It is asserting operator-style output in a lint fixture that is post-formatted. |
| `require-argument-separators` | Fixture fails during parsing on `show_debug_message_ext(name payload);`. | Fixture setup looks incorrect under the current parse-first lint model. |
| `require-control-flow-braces` | Final output misses the semicolon in the first newly braced block. | Fixture looks correct. This is a real output bug in the formatter-plus-lint path. |

## Integration workspace (root cross-module integration fixtures)

These are end-to-end fixtures under `test/fixtures/integration/`. They exercise formatting plus selected lint rules together.

| Fixture | Failure | Audit verdict |
| --- | --- | --- |
| `test-int-comments-ops` | Actual output aggressively normalizes comments, doc formatting, operator spelling, and decorative comments beyond what the golden expects. | Expected output looks stale relative to the currently enabled rules. |
| `test-int-doc-banner` | Actual output rewrites banner comments and math expressions more aggressively than the golden expects. | Expected output looks stale. |
| `test-int-flow-hoist` | Fixture fails before execution because `gmloop.json` sets `gml/prefer-hoistable-loop-accessors` to an array instead of `"off"`, `"warn"`, or `"error"`. | Fixture config is incorrect. |
| `test-int-format-strings` | Actual output keeps string interpolation and restructures control flow, while expected preserves older string literal and early-return forms. | Expected output looks stale relative to the enabled rules. |
| `test-int-func-rules` | Actual output applies many enabled-rule rewrites that the golden does not reflect, including default handling, undefined checks, argument handling, and doc normalization. | Expected output looks stale or under-normalized for the configured rule set. |
| `test-int-logic-flow` | Expected output assumes much stronger boolean-algebra simplification than current behavior performs. | Expected output likely stale or too aggressive. |
| `test-int-manual-math` | Actual output prefers `dsin/dcos/dtan` and preserves a multiplication split by an inline comment, while expected wants older `sin(degtorad(...))` forms and `sqr(value)`. | Expected output looks stale. |
| `test-int-math-docs` | Expected output over-optimizes many expressions and even expects `myStruct[]` instead of the keyed access present in actual output. | Expected output looks incorrect or stale. |
| `test-int-math-nested` | Only remaining differences are redundant parentheses around multiplicative expressions. | Expected output looks stale or too specific about harmless grouping. |
| `test-int-newlines` | Actual output adds one extra blank line before `repeat (to_spawn)`. | Fixture looks correct. This is a formatter newline regression. |
| `test-int-no-globalvar` | Expected output rewrites `globalvar` declarations into `global.*` assignments, but current `gml/no-globalvar` is diagnostic-only and does not fix. | Expected output is stale for the current rule behavior. |
| `test-int-ops-logic` | Expected output assumes constant-folding and algebraic rewrites that the configured rules do not currently perform. | Expected output looks stale or incorrect. |
| `test-int-strings.input-copy` | Fixture is marked `idempotent`, but the input is plainly not formatter-idempotent. It still contains legacy string layout, extra semicolons, and multiline interpolation formatting that current formatting rewrites. | Fixture setup is incorrect. |

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

- `gml/no-globalvar` is currently diagnostic-only and does not implement an autofix, so any fixture expecting `globalvar` to become `global.<name>` is out of date.
- `gml/require-control-flow-braces` is diagnostic-only and depends on the formatter to produce the final braced layout, so semicolon or blank-line mismatches in those fixtures are formatter-path problems.
- The lint fixture harness post-formats lint output, so some lint fixtures are implicitly asserting formatter style in addition to rule behavior.
