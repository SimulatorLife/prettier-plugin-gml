# Documentation index

Use this index to jump straight to the planning notes and references that shape
prettier-plugin-gml. The summaries below highlight what each guide covers so you
can pick the right level of detail for your task.

## Reference guides

- [Identifier Case Utility Reference](identifier-case-reference.md) — Explains how
  identifiers are tokenised, normalised, and reconstructed by the shared
  casing helpers. Start here before enabling `gmlIdentifierCase`.
- [Naming Convention Case Reference](naming-convention-case-reference.md) — Lists
  the supported case styles, scope overrides, and acknowledgement flags the
  formatter recognises when rewriting identifiers.
- [Examples: Tricky identifier casing](examples/naming-convention/tricky-identifiers.md)
  — A collection of real-world identifiers that demonstrate how the formatter
  classifies edge cases and applies rename overrides.

## Planning notes

- [Naming Convention Option Plan](naming-convention-option-plan.md) — Lays out the
  product direction for the identifier renaming options exposed by the plugin.
- [Asset Rename Precautions](asset-rename-precautions.md) — Operational guidance
  for keeping GameMaker projects safe when automated renames touch metadata and
  source files.
- [Reserved Identifiers Plan](reserved-identifiers-plan.md) — Documents how
  reserved names are harvested from the GameMaker manual and how the formatter
  uses the dataset to avoid destructive renames.
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
  and [Reserved Identifiers Plan](reserved-identifiers-plan.md) when updating the
  scrapers.
