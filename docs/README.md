# Documentation index

Use this index to jump straight to the planning notes and references that shape
prettier-plugin-gml. The summaries below highlight what each guide covers so you
can pick the right level of detail for your task. Looking for installation or
contributor setup steps? The [repository README](../README.md) captures the
quick-start flow, formatter configuration, and day-to-day development commands.

## Reference guides

- [Identifier Case & Naming Convention Guide](naming-conventions.md) — One-stop
  overview of the identifier normalisation pipeline, configuration roadmap,
  rollout workflow, and operational safeguards for `gmlIdentifierCase`.
- [Examples: Tricky identifier casing](examples/naming-convention/tricky-identifiers.md)
  — A collection of real-world identifiers that demonstrate how the formatter
  classifies edge cases and applies rename overrides.
- [Dead code audit playbook](dead-code-audit.md) — Checklist and remediation
  steps for pruning unused code surfaced by the formatter’s metadata reports.
- [Minimal surface area audit](minimal-surface-audit.md) — Procedure for
  reviewing module entry points, trimming exports to the supported API, and
  documenting private implementation details.

## Usage & rollout

- [Identifier-case rollout playbook](identifier-case-rollout.md) — Step-by-step
  instructions for enabling automatic renames, understanding the
  auto-discovery bootstrap, and keeping cache hygiene under control across
  local machines and CI.
- [Identifier-case scope reference](identifier-case-reference.md) — Deep dive
  into how each rename scope is planned, validated, and surfaced in reports so
  you can audit dry-run output or diagnose skipped renames.

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

## Metadata tooling

- [Architecture overview](../README.md#architecture-overview) — The repository
  README explains how the workspace packages relate, where generated assets live,
  and which scripts refresh them. Pair it with
  [Feather Data Plan](feather-data-plan.md) and the reserved identifier coverage
  in [Identifier Case & Naming Convention Guide](naming-conventions.md#5-reserved-identifier-dataset)
  when updating the scrapers.
