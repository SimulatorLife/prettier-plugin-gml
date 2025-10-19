# Documentation index

Use this index to jump straight to the planning notes and references that shape
prettier-plugin-gml. The summaries below highlight what each guide covers so you
can pick the right level of detail for your task. Looking for installation or
contributor setup steps? The [repository README](../README.md) captures the
quick-start flow, formatter configuration, CLI wrapper options, and day-to-day
development commands.

## Reference guides

- [Identifier Case & Naming Convention Guide](naming-conventions.md) — One-stop
  overview of the identifier normalisation pipeline, configuration roadmap,
  rollout workflow, and operational safeguards for `gmlIdentifierCase`.
- [Examples: Tricky identifier casing](examples/naming-convention/tricky-identifiers.md)
  — A collection of real-world identifiers that demonstrate how the formatter
  classifies edge cases and applies rename overrides.

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
- [Sample `.prettierignore`](examples/example.prettierignore) — Baseline ignore
  file tuned for common GameMaker metadata folders when rolling the formatter
  into an existing repository.

## Planning notes

- [Identifier Case & Naming Convention Guide](naming-conventions.md) — Also
  contains the condensed implementation plan, testing expectations, and rename
  risk mitigations for the feature.
- [Feather Data Plan](feather-data-plan.md) — Describes the scraping pipeline that
  collects built-in Feather debugger metadata and how the generated files are
  versioned.
- [Project Index Cache Design](project-index-cache-design.md) — Captures the
  shipped cache shape plus the instrumentation used to keep bootstrap behaviour
  predictable.
- [Project Index next steps](project-index-next-steps.md) — Tracks remaining
  follow-up work now that cache persistence and discovery ship in the plugin.

## Formatter & CLI deep dives

- [Shared module layout refresh](shared-module-layout.md) — Summarises the
  repository-wide audit that reorganised the `src/shared` helpers into
  `ast/` and `utils/` entry points so downstream packages share a consistent
  import surface.
- [Architecture audit (May 2024)](architecture-audit-2024-05-15.md) — Captures
  the state of the formatter, parser, and CLI packages after the workspace
  split, including upgrade risks and sequencing notes for future refactors.
- [Interface segregation investigation](interface-segregation-investigation.md)
  — Research notes that detail why the CLI and plugin expose separate entry
  points, how shared utilities are packaged, and where the CLI wrapper inserts
  additional behaviour such as `.prettierignore` discovery.

## Metadata tooling

- [Architecture overview](../README.md#architecture-overview) — The repository
  README explains how the workspace packages relate, where generated assets live,
  and which scripts refresh them. Pair it with
  [Feather Data Plan](feather-data-plan.md) and the reserved identifier coverage
  in [Identifier Case & Naming Convention Guide](naming-conventions.md#5-reserved-identifier-dataset)
  when updating the scrapers.
