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

## Current Features
- **WorkspaceEdit**: Data structure for managing text edits across multiple files
- **RefactorEngine**: Core orchestrator for semantic-safe refactoring operations
  - `collectSymbolOccurrences`: Integrates with semantic analyzer to gather all declarations and references for a symbol
  - `validateSymbolExists`: Checks symbol existence before refactoring
  - `planRename`: Plans rename operations (validation and error handling implemented, full implementation in progress)
  - `validateRename`: Validates planned renames for safety
  - `prepareHotReloadUpdates`: Prepares integration data for hot reload (stub)

## Status
Core scaffolding is in place with semantic analyzer integration for symbol occurrence collection.
The `collectSymbolOccurrences` method provides the foundation for rename planning by bridging
the refactor engine with the semantic package's `getSymbolOccurrences` API. Full rename planning
and hot-reload integration are in progress as semantic and transpiler layers stabilize.
