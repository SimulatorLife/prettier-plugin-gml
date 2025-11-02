# Refactor Engine Module

This package will power semantic refactoring workflows such as safe renames, as outlined in
`docs/semantic-scope-plan.md` and the hot-reload lifecycle in `docs/live-reloading-concept.md`.
It consumes parser spans and semantic bindings to plan WorkspaceEdits that the CLI can apply
atomically across the project.

## Responsibilities
- Query parser span data and semantic bindings to map identifiers to source ranges.
- Plan edits that avoid scope capture or shadowing, and surface validation diagnostics.
- Offer composable helpers so CLI commands can trigger refactors and post-formatting steps.
- Re-run targeted analysis after edits to ensure symbol bindings remain stable.

## Directory layout
- `src/` – core refactoring primitives and orchestrators.
- `test/` – Node tests that validate refactor strategies against fixture projects.

## Status
Only scaffolding exists today. The package exports a placeholder `RefactorEngine` that will be
replaced with the full implementation as soon as the semantic and transpiler layers settle.
