# Codex workflow reference

Use this guide to understand what each Codex automation is looking for and which
remediation patterns keep the resulting pull requests focused and maintainable.

## Codex 80 – Low Coupling Guardrail

The low-coupling workflow scans for modules that import siblings or cousins via
fragile deep paths—specifically:

- Relative imports that climb multiple directory levels (for example `../..`).
- Paths that reach into `internal` directories that should be treated as
  implementation details.

When Codex opens a pull request from this workflow, it should recommend
structural boundaries that keep consumers aligned with stable contracts. The
expected remediation patterns include:

- **Interfaces and abstract types** that define the collaborator’s public
  surface, keeping callers unaware of underlying implementations.
- **Adapters or facades** that translate between domains or expose curated entry
  points so downstream modules stop depending on private utilities.
- **Factories** that construct the right concrete implementation while returning
  interface-shaped handles to consumers.
- **Dependency injection** (constructor parameters, factory arguments, or
  provider functions) so modules receive collaborators from the outside instead
  of importing deep internal files.

Codex should note when deeper redesign is required, but its default move is to
introduce the smallest abstraction that removes the deep import while preserving
behaviour and test coverage.
