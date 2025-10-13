# Documentation index

Use this index to jump straight to the planning notes and references that shape
prettier-plugin-gml. The summaries below highlight what each guide covers so you
can pick the right level of detail for your task.

## Reference guides

- [Identifier Case & Naming Convention Guide](naming-conventions.md) — One-stop
  overview of the identifier normalisation pipeline, configuration roadmap,
  rollout workflow, and operational safeguards for `gmlIdentifierCase`.
- [Examples: Tricky identifier casing](examples/naming-convention/tricky-identifiers.md)
  — A collection of real-world identifiers that demonstrate how the formatter
  classifies edge cases and applies rename overrides.

## Planning notes

- [Identifier Case & Naming Convention Guide](naming-conventions.md) — Also
  contains the condensed implementation plan, testing expectations, and rename
  risk mitigations for the feature.
- [Feather Data Plan](feather-data-plan.md) — Describes the scraping pipeline that
  collects built-in Feather debugger metadata and how the generated files are
  versioned.
- [Project Index Cache Design](project-index-cache-design.md) — Captures the
  proposed approach for caching project discovery so concurrent formatter runs
  can reuse work safely.

## Metadata tooling

- [Resources overview](../README.md#architecture-overview) — The repository README
  explains how generated assets inside `resources/` and the regeneration scripts
  in `scripts/` fit together. Pair it with [Feather Data Plan](feather-data-plan.md)
  and the reserved identifier coverage in
  [Identifier Case & Naming Convention Guide](naming-conventions.md#5-reserved-identifier-dataset)
  when updating the scrapers.
