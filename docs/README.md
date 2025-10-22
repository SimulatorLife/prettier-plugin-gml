# Documentation index

Use this index to jump straight to the planning notes and references that shape
prettier-plugin-gml. The summaries below highlight what each guide covers so you
can pick the right level of detail for your task. Looking for installation or
contributor setup steps? Start with the [repository README](../README.md) for
the quick-start checklist, formatter configuration matrix, CLI wrapper options,
and day-to-day development commands, then return here when you need deeper
context.

## Reference guides

- [Identifier Case & Naming Convention Guide](naming-conventions.md) — One-stop
  overview of the identifier normalisation pipeline, configuration roadmap,
  rollout workflow, and operational safeguards for `gmlIdentifierCase`.
- [Examples: Tricky identifier casing](examples/naming-convention/tricky-identifiers.md)
  — Real-world snippets that demonstrate how rename heuristics classify edge
  cases and apply overrides.
- [Sample `.prettierignore`](examples/example.prettierignore) — Baseline ignore
  file tuned for common GameMaker metadata folders.

## Usage & rollout

- [Identifier-case rollout playbook](identifier-case-rollout.md) — Step-by-step
  instructions for enabling automatic renames, understanding the
  auto-discovery bootstrap, and keeping cache hygiene under control across
  local machines and CI.
- [Identifier-case scope reference](identifier-case-reference.md) — Deep dive
  into how each rename scope is planned, validated, and surfaced in reports so
  you can audit dry-run output or diagnose skipped renames.
- [Locals-first identifier-case config example](examples/identifier-case/locals-first.prettierrc.mjs)
  — Scripted configuration that warms the project-index cache and captures
  dry-run reports for review.
- [CLI wrapper reference](../README.md#cli-wrapper-environment-knobs) — Quick
  lookup for environment variables and wrapper behaviour when scripting
  formatter runs in CI or editor tooling.

## Architecture & planning

- [Architecture audit (October 2025)](architecture-audit-2025-10-22.md) — Daily
  architecture snapshot that tracks the shared-module consolidation. Pair with
  the [May 2024 audit](architecture-audit-2024-05-15.md) to see how the
  workspace evolved.
- [Shared module layout refresh](shared-module-layout.md) — Summary of the
  repository-wide audit that reorganised the `src/shared` helpers into
  focused barrels.
- [Interface segregation investigation](interface-segregation-investigation.md)
  — Research notes that detail why the CLI and plugin expose separate entry
  points, how shared utilities are packaged, and where the CLI wrapper inserts
  additional behaviour such as `.prettierignore` discovery.
- [Project Index Cache Design](project-index-cache-design.md) — Captures the
  shipped cache shape plus the instrumentation used to keep bootstrap behaviour
  predictable.
- [Project Index next steps](project-index-next-steps.md) — Tracks remaining
  follow-up work now that cache persistence and discovery ship in the plugin.

## Metadata tooling

- [Feather Data Plan](feather-data-plan.md) — Describes the scraping pipeline
  that collects built-in Feather debugger metadata and how the generated files
  are versioned.
- [Architecture overview](../README.md#architecture-overview) — High-level map
  of the workspace packages, where generated assets live, and which scripts
  refresh them. Pair it with the reserved identifier coverage in the
  [Identifier Case & Naming Convention Guide](naming-conventions.md#5-reserved-identifier-dataset)
  when updating the scrapers or running metadata rebuilds through the CLI.
