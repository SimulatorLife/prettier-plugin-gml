# Reserved identifier metadata hook

## Pre-change analysis
- `loadReservedIdentifierNames` reads identifier metadata from
  `resources/gml-identifiers.json` via a hard-coded `require` path. There is no
  supported way to swap in alternate metadata when embedding the formatter in
  tooling that works with bespoke GameMaker forks or staged rollouts.
- Downstream modules such as identifier-case planning assume the metadata comes
  from that bundled JSON file, so any consumer that needs to test or stage
  different identifier inventories must patch modules in place.

## Extension seam
- Introduce a small configuration hook that allows callers to provide a
  replacement metadata loader function. The hook will default back to the
  bundled JSON loader so existing behaviour is preserved.
- The loader override stays in-memory and is intentionally scoped to advanced
  integrations (CLI experiments, editor previews, or testing fixtures). It keeps
  the plugin opinionated by continuing to default to the shipped metadata.

## Default behaviour and evolution
- By default the loader continues to read `resources/gml-identifiers.json`.
- Consumers should use the new `setReservedIdentifierMetadataLoader` helper in a
  `try`/`finally` block alongside the provided reset function to stage custom
  metadata for experiments or integration tests.
- As the identifier metadata pipeline matures we can evolve the hook into a more
  formal provider registry, but today it deliberately exposes the minimal surface
  area needed to unblock alternate metadata sources without complicating the
  public API.
