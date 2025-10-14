# Identifier case scope reference

This supplement expands on the identifier-case rollout guide and documents how
each rename scope is planned, validated, and applied. Use it when diagnosing
why a rename did or did not occur or when configuring dry-run checks in CI.

## Supported scopes

Identifier-case planning now evaluates the following scopes in addition to
locals and assets:

| Scope | Source | Coverage |
| --- | --- | --- |
| Functions | Script resources | Declarations and call expressions resolved through the project index. |
| Struct constructors | Script resources marked as constructors | Declarations and `new` expressions resolved to struct scripts. |
| Macros | `#macro` statements | Declarations and macro references in expressions. |
| Globals | `globalvar` declarations and global assignments | Declarations plus reads/writes to `global` identifiers. |
| Instance | Assignments inside object events | Instance assignments inferred from object event scopes. |

All scopes respect the base `gmlIdentifierCase` style unless overridden by the
scope-specific toggle (for example `gmlIdentifierCaseFunctions`). When a scope is
set to "off" the planner records metrics but does not queue operations.

## Planning and rename map generation

`buildProjectIndex` now records precise source locations for script and struct
declarations, including constructor functions discovered in script resources.
Function and constructor identifiers are resolved via the project index and
their references are registered both for regular calls and `new` expressions,
allowing cross-file renames to stay in sync.

For each enabled scope the planner:

1. Resolves the canonical identifier name from declarations (preferring explicit
   declaration metadata over resource names).
2. Computes the target style using `formatIdentifierCase`.
3. Checks preserved/ignored lists and emits informational conflicts when an
   identifier is skipped.
4. Tracks cross-scope collisions (for example, a function colliding with a
   global) and records actionable errors before any writes occur.
5. Stores rename operations and maps keyed by the declaration/reference span so
   the printer can apply renames without mutating unrelated tokens.

Dry-run mode populates the rename plan and conflict list without mutating source
files. Write mode reuses the same plan to drive the printer so the declaration
and all references are rewritten consistently.

## Safety guarantees

- **Cross-scope collision detection** – When multiple scopes would converge on
  the same formatted identifier the planner emits a `collision` conflict and
  short-circuits rename application until the collision is resolved.
- **Configuration conflicts** – Identifiers that are preserved or matched by the
  ignore patterns are reported with `info`-level conflicts so developers can
  audit configuration-driven skips.
- **Metrics and option store** – The planner attaches metrics, rename plans, and
  conflicts to the identifier-case option store. Tests and editor integrations
  can snapshot this data to verify behaviour across dry-run and write scenarios.

Refer to the updated integration tests under
`src/plugin/tests/identifier-case-top-level.integration.test.js` for end-to-end
coverage of each scope in both dry-run and write modes.
