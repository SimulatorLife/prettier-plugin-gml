# Legacy identifier-case and rename plan

> **Status: Archived reference.** The strategy described below reflects the previous
> identifier-case semantic module and rename rollout plan. It is no longer being
> expanded, but it remains available to help interpret the historical
> implementation. The active scope roadmap now lives in the
> [live reloading concept](./live-reloading-concept.md) under "Scope-aware
> semantic pipeline".

This archive consolidates the identifier-case handbook, scope reference,
rollout playbook, and example set that previously lived across multiple files.
Use it when auditing legacy behaviour, interpreting past reports, or migrating
notes into the newer semantic pipeline.

## Legacy architecture snapshot

The original `gmlIdentifierCase` implementation rewrote user-defined
identifiers—variables, functions, macros, enums, and assets—to a configurable
case style while preserving GameMaker semantics. The helpers in
`src/semantic/src/identifier-case/identifier-case-utils.js` normalised each
identifier through the following stages:

1. **Prefix detection** – Known prefixes (for example `global.`, `other.`,
   `self.`, `local.`, `with.`, `noone.`, `argument`, `argument_local`,
   `argument_relative`, and array-style accessors such as `argument[2]`) were
   stripped before conversion and restored afterwards. Integrations could extend
   the preserved list through `reservedPrefixes` overrides when calling
   `normalizeIdentifierCaseWithOptions` or `formatIdentifierCaseWithOptions`
   directly.
2. **Numeric suffix capture** – Trailing digit runs, optionally preceded by an
   underscore (for example `_12`), were recorded separately so counters remained
   attached to the identifier.
3. **Edge underscores** – Leading and trailing underscores were temporarily
   removed and re-applied verbatim during reconstruction.
4. **Tokenisation** – The remaining content split into ordered tokens using
   underscore separators, camel-case boundaries, and digit runs. Alphabetic
   tokens were lowercased, while numeric tokens retained their digits.

Tokenisation respected existing separators (periods, underscores, array
brackets) and kept recognised prefixes untouched. Leading or trailing
underscores were restored after reconstruction. Case emitters produced the
requested style while keeping the process idempotent—identifiers that already
matched the target style survived round trips unchanged.

### Supported case reconstructions

| Style | Description |
| --- | --- |
| `camel` | Lower camelCase, capitalising tokens after the first alphabetic fragment while preserving numeric runs (for example `hp2D_max` → `hp2DMax`). |
| `pascal` | Upper camelCase with every alphabetic token capitalised (`hp2D_max` → `Hp2DMax`). |
| `snake-lower` | Lower snake_case joining tokens with underscores (`hp2DMax` → `hp2d_max`). |
| `snake-upper` | Upper snake_case (`hp2DMax` → `HP2D_MAX`). |

## Legacy scope coverage and planning

The planner evaluated additional scopes beyond locals and assets to keep rename
behaviour aligned across declarations and references:

| Scope | Source | Coverage |
| --- | --- | --- |
| Functions | Script resources | Declarations and call expressions resolved through the project index. |
| Struct constructors | Script resources marked as constructors | Declarations and `new` expressions resolved to struct scripts. |
| Macros | `#macro` statements | Declarations and macro references in expressions. |
| Globals | `globalvar` declarations and global assignments | Declarations plus reads/writes to `global` identifiers. |
| Instance | Assignments inside object events | Instance assignments inferred from object event scopes. |

Each scope respected the base `gmlIdentifierCase` style unless a dedicated toggle
(such as `gmlIdentifierCaseFunctions`) disabled or overrode it. When a scope was
turned "off" the planner still recorded metrics but skipped the corresponding
rename operations. Projects that relied on bespoke namespaces could extend the
reserved prefix list through the same overrides used by the core helpers.

Planning combined the project index with deterministic rename maps:

1. Resolve canonical identifier names from declarations, preferring explicit
   metadata over resource names.
2. Compute the target style through `formatIdentifierCase`.
3. Honour preserved and ignored lists, surfacing informational conflicts for
   skipped identifiers.
4. Detect cross-scope collisions (for example, function versus global) and block
   writes until the conflict cleared.
5. Store rename operations keyed by declaration/reference spans so the printer
   could update the source without mutating unrelated tokens.

Dry-run mode populated rename plans and conflicts without touching source files.
Write mode reused the same plan, applying the edits after all safety checks
passed.

## Bootstrap, configuration, and caching

The formatter auto-discovered GameMaker projects whenever renaming scopes were
enabled:

- Searching upward from the formatted file for a `.yyp` manifest.
- Loading `.prettier-plugin-gml/project-index-cache.json` when present and
  rebuilding the project index if the cache was missing or stale.
- Storing the bootstrap metadata on the Prettier options object so tests and
  editor integrations could inspect whether the index came from a cache hit or a
  rebuild (`options.__identifierCaseProjectIndexBootstrap.source`).

Key configuration switches kept the bootstrap predictable:

| Option | Purpose |
| --- | --- |
| `gmlIdentifierCaseProjectRoot` | Pin the bootstrap to a specific project directory when formatting files outside the manifest tree. |
| `gmlIdentifierCaseDiscoverProject` | Disable discovery entirely when supplying an `identifierCaseProjectIndex` manually. |
| `identifierCaseProjectIndex` | Provide a JSON snapshot generated by external tooling to keep plans deterministic across machines. |
| `gmlIdentifierCaseAcknowledgeAssetRenames` | Required before enabling asset renames so disk mutations and `.yy` updates were opt-in. |
| `gmlIdentifierCaseProjectIndexCacheMaxBytes` | Cap the on-disk cache payload (default `8 MiB`, overridable through `GML_PROJECT_INDEX_CACHE_MAX_SIZE`). |
| `gmlIdentifierCaseProjectIndexConcurrency` | Control how many sources were parsed in parallel while building the index (default `4`, clamped between `1` and `16`, overridable through `GML_PROJECT_INDEX_CONCURRENCY`). |
| `gmlIdentifierCaseOptionStoreMaxEntries` | Bound the number of identifier-case option snapshots retained for debugging. |

Cache entries lived under `PROJECT/.prettier-plugin-gml/project-index-cache.json`
with keys derived from the formatter version, plugin version, manifest mtimes,
and the mtimes of the sources involved in the plan. Deleting the directory forced
a rebuild on the next run. Dry-run metrics reported cache hits versus rebuilds to
support deterministic CI assertions.

Manual snapshots remained supported for audits: call
`buildProjectIndex(projectRoot)` (or reuse the scripted example in
`docs/examples/identifier-case/locals-first.prettierrc.mjs`), persist the JSON,
and provide it via `identifierCaseProjectIndex` to replay the exact plan.

## Rollout workflow and safeguards

A locals-first rollout kept the legacy feature safe for teams adopting renames:

1. **Warm the cache** by running the formatter once from the project root so the
   bootstrap could materialise `.prettier-plugin-gml/project-index-cache.json`.
2. **Enable a dry-run locals scope** (`gmlIdentifierCaseLocals: "camel"`) while
   leaving other scopes set to `"inherit"` and capture reports through
   `identifierCaseReportLogPath`.
3. **Review dry-run output** for collisions, preserved identifiers, and missing
   coverage before enabling writes.
4. **Expand scope coverage incrementally** (functions → structs → instance →
   globals → macros/defines) with peer review at each stage. Asset renames were
   deferred until the team was ready for on-disk changes.
5. **Promote to write mode** by disabling the dry-run flag, re-running Prettier
   with `--write`, and committing both code edits and the accompanying audit log.

Operational safeguards emphasised reversible checkpoints and predictable disk
mutations:

- Capture a commit or external backup before running rename writes.
- Confirm the formatter process had write access; rename utilities aborted when
  permissions were missing.
- Review generated rename logs and keep them with the backup until the GameMaker
  IDE validated the changes.
- Restore from the checkpoint if a rename failed midway.

## Example conversions

These preserved examples illustrate how tricky identifiers normalised across the
supported case styles:

| Original identifier | camel | pascal | snake-lower | snake-upper |
| --- | --- | --- | --- | --- |
| `hp2D_max` | `hp2DMax` | `Hp2DMax` | `hp2d_max` | `HP2D_MAX` |
| `argument[0]` | `argument[0]` | `argument[0]` | `argument[0]` | `argument[0]` |
| `argument[0].hp_max` | `argument[0].hpMax` | `argument[0].HpMax` | `argument[0].hp_max` | `argument[0].HP_MAX` |
| `global.__hpMax` | `global.__hpMax` | `global.__HpMax` | `global.__hp_max` | `global.__HP_MAX` |
| `HTTPRequestURL` | `httpRequestUrl` | `HttpRequestUrl` | `http_request_url` | `HTTP_REQUEST_URL` |
| `_privateValue` | `_privateValue` | `_PrivateValue` | `_private_value` | `_PRIVATE_VALUE` |
| `__init__` | `__init__` | `__Init__` | `__init__` | `__INIT__` |
| `pathFinder_state_2` | `pathFinderState2` | `PathFinderState2` | `path_finder_state_2` | `PATH_FINDER_STATE_2` |

Identifiers that already satisfied the requested case (for example `argument[0]`)
remained unchanged across conversions.

## Related legacy assets

- `docs/examples/identifier-case/locals-first.prettierrc.mjs` — Scripted
  configuration for warming the project-index cache and capturing dry-run
  reports.
- `resources/gml-identifiers.json` — Snapshot of reserved identifiers harvested
  from the GameMaker manuals to avoid collisions during automated renames.

For current scope behaviour, consult the "Scope-aware semantic pipeline" section
in `docs/live-reloading-concept.md` and the semantic package README.
