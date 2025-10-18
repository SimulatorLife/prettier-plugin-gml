# Identifier Case & Naming Convention Guide

This consolidated guide explains how the Prettier GML plugin normalises GameMaker
identifiers, the roadmap for the opt-in renaming feature, and the operational
playbook for rolling the feature out safely. Pair it with the curated fixture
set in [`examples/naming-convention/`](./examples/naming-convention/) when you
need concrete before/after samples.

## 1. Core identifier-case system

The plugin helpers in `src/plugin/src/identifier-case/identifier-case-utils.js` break every identifier into
a stable structure before applying a new case style. The normalisation pipeline
behaves as follows:

1. **Prefix detection** – Known prefixes are removed first and restored after
   conversion. Recognised values include `global.`, `other.`, `self.`, `local.`,
   `with.`, `noone.`, `argument`, `argument_local`, `argument_relative`, and
   array-style accessors such as `argument[2]`. When a prefix ends in `.`, the
   dot stays with the prefix. Custom tooling can register extra prefixes by
   using `normalizeIdentifierCaseWithOptions` or
   `formatIdentifierCaseWithOptions` and passing `reservedPrefixes` overrides
   when calling the helpers directly.
2. **Numeric suffix capture** – A trailing run of digits, optionally prefixed by
   one underscore (for example `_12`), is stored separately so counters remain
   attached to the identifier.
3. **Edge underscores** – Leading and trailing underscores are removed from the
   working string and reapplied verbatim during reconstruction.
4. **Tokenisation** – The remaining content splits into ordered tokens using
   underscore separators, camel-case boundaries, and digit runs. Alphabetic
   tokens are lowercased; numeric tokens retain their digits.

These steps yield an object containing the prefix, preserved underscores, suffix
metadata, and the ordered tokens. Case reconstruction helpers then emit the
final identifier while reapplying every preserved fragment. The helpers are
idempotent—identifiers already matching a target style survive round-trips
unchanged.

### Supported case reconstructions

| Style          | Description and examples |
| -------------- | ------------------------ |
| `camel`        | Lower camelCase. The first alphabetic token stays lowercase; later tokens are capitalised. Numeric runs stay inline (`hp2D_max` → `hp2DMax`). |
| `pascal`       | Upper camelCase. Every alphabetic token is capitalised while numeric runs are copied as-is (`hp2D_max` → `Hp2DMax`). |
| `snake-lower`  | Lower snake_case. Alphabetic tokens become lowercase and underscores join tokens (`hp2DMax` → `hp2d_max`). Adjacent digits and letters share a separator only when needed. |
| `snake-upper`  | Upper snake_case. Alphabetic tokens become uppercase with underscores inserted between tokens (`hp2DMax` → `HP2D_MAX`). |

Tokenisation respects existing separators (periods, underscores, array brackets)
and keeps prefixes such as `global.` or `argument[0]` untouched. Leading or
trailing underscores remain exactly as written.

## 2. Feature architecture and roadmap

### Objective and constraints

The `gmlIdentifierCase` option rewrites user-defined identifiers—variables,
functions, macros, enums, and assets—to a configurable case style while
preserving GameMaker semantics. The implementation must:

- Avoid collisions with reserved identifiers shipped in
  [`resources/gml-identifiers.json`](../resources/gml-identifiers.json).
- Respect declaration scope (locals, script-level, instance, global, macros,
  assets) and relationships stored in `.yy` metadata.
- Operate within Prettier’s stateless execution model by sharing a cached
  project index between formatting runs.
- Allow incremental adoption through per-scope overrides, ignore/preserve
  lists, and an audit-friendly dry-run mode.

### Deliverables snapshot

1. **Configuration surface** – Add `gmlIdentifierCase` plus scope-specific
   overrides (e.g. `gmlIdentifierCaseLocals`, `gmlIdentifierCaseGlobals`),
   dry-run toggles, ignore/preserve lists, and asset acknowledgement flags.
2. **Identifier analysis** – Extend the parser to emit declaration metadata and
   build a reusable `ProjectIndex` capturing identifiers, scopes, references,
   and built-ins.
3. **Transformation engine** – Implement deterministic case conversion, detect
   conflicts, and update `.yy` metadata and file names when assets opt in.
4. **Formatter integration** – Replace identifier tokens using the rename plan
   while surfacing diagnostics for skipped or conflicting operations.
5. **Testing & docs** – Cover token edge cases, parser regressions, integration
   scenarios, and document configuration plus troubleshooting flows.

### Implementation phases

- **Design spike** – Finalise casing expectations and example fixtures.
- **Parser & cache groundwork** – Publish scope-aware symbol tables and design
  the on-disk cache used by the project index.
- **Project index pipeline** – Traverse `.gml`/`.yy` files, exclude built-ins,
  and store cross-file relationships needed for rename propagation.
- **Case utilities & option plumbing** – Implement conversion helpers and expose
  the `gmlIdentifierCase` configuration surface with validation.
- **Dry-run reporting** – Emit structured rename summaries to aid peer review.
- **Incremental execution** – Enable locals first, then functions, structs,
  instance/global fields, macros, and finally assets.
- **Asset rename propagation** – Mutate `.yy` metadata and disk paths safely
  once dependency tracking is reliable.
- **Conflict policy & performance** – Detect collisions, honour preserved names,
  and instrument the pipeline for profiling.
- **Documentation & release** – Update README, craft migration guides, and
  package the feature for publication.

## 3. Rollout workflow

Follow this playbook to introduce identifier casing on a real project:

1. **Prerequisites** – Install the plugin locally, ensure Node.js 18.20.0+ (or
   20.18.1+/21.1.0+) is available, and commit a clean snapshot before testing
   renames.
2. **Warm the project index cache** – From the GameMaker project root (the
   directory containing the `.yyp` file), run the formatter once so the bootstrap
   can create `.prettier-plugin-gml/project-index-cache.json`. When you need a
   reproducible snapshot, reuse the scripted example in
   [`docs/examples/identifier-case/locals-first.prettierrc.mjs`](./examples/identifier-case/locals-first.prettierrc.mjs)
   to persist `.gml-reports/project-index.json` for audits.
3. **Configure a locals-first dry run** – Start with a configuration that enables
   `gmlIdentifierCase` globally but sets every scope override to `"inherit"`
   except for locals (e.g. `gmlIdentifierCaseLocals: "camel"`). Keep
   `identifierCaseDryRun` enabled and, when using a manual snapshot, point
   `identifierCaseProjectIndex` at the saved JSON while also capturing logs via
   `identifierCaseReportLogPath`.
4. **Run and review** – Format the project with `--write`. Dry-run mode leaves
   sources untouched but prints a rename summary and writes a JSON report.
   Verify the planned renames and review conflicts such as collisions or
   preserved identifiers before proceeding.
5. **Expand scope incrementally** – Promote additional scopes one at a time
   (functions → structs → instance variables → globals → macros/defines),
   re-running the dry run and peer review after each change. Keep asset renames
   disabled until the team is ready for disk-level mutations.
6. **Promote to write mode** – After the plan is approved, set
   `identifierCaseDryRun: false`, run Prettier with `--write`, inspect the
   resulting file and report changes, and commit both the code and audit log.

Troubleshooting tips:

- Missing renames usually indicate an outdated project index path.
- Collision diagnostics call out competing identifiers; rename them manually or
  adjust scope settings.
- Leave `gmlIdentifierCaseAssets` off until you have acknowledged the disk
  changes and validated permissions.
- Refresh the project index after moving scripts or resources so reports stay
  accurate.

## 4. Operational safeguards

Automated asset renames touch both `.yy` metadata and on-disk file names. Mitigate
risk by:

1. Capturing a reversible checkpoint (commit or external backup) before running
   rename writes.
2. Verifying the formatter process has write access to affected directories; the
   rename utilities abort when permissions are missing.
3. Reviewing the generated rename log and keeping it with your backup until the
   GameMaker IDE validates the changes.

If a rename fails midway, restore from the checkpoint before retrying.

## 5. Reserved identifier dataset

The plugin avoids renaming built-in identifiers by shipping a harvested snapshot
of GameMaker keywords, constants, variables, and enums.

- **Goals** – Stay aligned with the current GameMaker release without manually
  curating lists, keep the formatter fast, and prefer first-party sources.
- **Sources** – The harvesting script at
  [`scripts/generate-gml-identifiers.mjs`](../scripts/generate-gml-identifiers.mjs)
  downloads assets from the YoYo Games manual repository: `ZeusDocs_keywords.json`
  (identifier → topic map), `ZeusDocs_tags.json` (topic metadata), and
  `Manual/contents/assets/scripts/gml.js` (keyword/constant arrays). Manual tags
  (e.g. `release-2024.11`) map to public GameMaker builds.
- **Extraction flow** – Choose a manual revision, cache the assets, parse the
  JavaScript arrays for keywords/literals/symbols, and merge them with the JSON
  datasets. When heuristics disagree, the script can fetch topic HTML for
  clarification. Normalisation deduplicates identifiers, records classification
  (function, variable, keyword, etc.), and flags deprecated entries.
- **Consumption** – The script emits a consolidated
  `resources/gml-identifiers.json` file consumed by the formatter at runtime. Run
  `npm run build:gml-identifiers` to refresh the snapshot and use the provided
  CLI flags (`--ref`, `--force-refresh`, `--cache-root`) or environment variables
  (`GML_MANUAL_REF`, `GML_MANUAL_CACHE_ROOT`, `GML_PROGRESS_BAR_WIDTH`,
  `GML_IDENTIFIER_VM_TIMEOUT_MS`, `GML_PROJECT_INDEX_CONCURRENCY`) to control
  regeneration and the identifier-case project index bootstrap defaults.
- **Operational notes** – Respect GitHub rate limits via caching and tokens, and
  host cached artefacts for offline or air-gapped environments. Monitor YoYo
  Games repositories for new data sources or metadata that can enrich the
  dataset.

## 6. Additional resources

- The curated examples under [`examples/naming-convention/`](./examples/naming-convention/)
  demonstrate tricky identifiers and expected conversions.
- `docs/project-index-cache-design.md` and `docs/feather-data-plan.md` cover
  supporting infrastructure used by the identifier renaming pipeline.
