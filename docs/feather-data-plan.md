# Plan: Automating Feather lint metadata ingestion

## Goals and scope
- Mirror the approach used for `gml-identifiers.json` by scraping first-party GameMaker sources instead of maintaining hand-written lint metadata.
- Capture the rules that affect formatter output: message catalogue (GM* diagnostics), naming-style presets, suppress/override directives, and Feather's type taxonomy.
- Produce a machine-readable artefact (stored as `resources/feather-metadata.json`) that can be regenerated against any GameMaker release tag and consumed by future formatting heuristics.

## Current implementation
- [`src/cli/generate-feather-metadata.js`](../src/cli/generate-feather-metadata.js) implements the scraper and defaults to writing `resources/feather-metadata.json`, keeping the generated dataset beside the identifier snapshot for easy consumption. The thin [`scripts/generate-feather-metadata.mjs`](../scripts/generate-feather-metadata.mjs) shim simply delegates to the shared CLI entry point.【F:src/cli/generate-feather-metadata.js†L1-L40】【F:scripts/generate-feather-metadata.mjs†L1-L6】
- Manual content fetched for a specific ref is cached under `scripts/cache/manual/<sha>/…` by default, so repeated runs avoid redundant network calls while iterating on the parser. The cache directory can now be overridden via `--cache-root` or the `GML_MANUAL_CACHE_ROOT` environment variable when local storage needs to live elsewhere.【F:src/cli/generate-feather-metadata.js†L228-L312】【F:src/cli/options/manual-cache.js†L1-L19】
- The CLI accepts the same ergonomics as the identifier generator: `--ref/-r` picks the manual revision, `--output/-o` controls the destination path, `--force-refresh` re-downloads upstream files, `--progress-bar-width` resizes the terminal progress indicator, `--manual-repo` targets a different GitHub repository, the new `--cache-root` flag relocates cached artefacts, and `--help/-h` prints the usage summary.【F:src/cli/generate-feather-metadata.js†L88-L212】
- Set `GML_MANUAL_REF` to steer CI or local scripts toward a known GameMaker release without passing extra flags each time, `GML_PROGRESS_BAR_WIDTH` to change the default progress bar width globally, `GML_MANUAL_REPO` to point at a forked manual repository, `GML_MANUAL_CACHE_ROOT` to move the manual cache without editing the scripts, and `GML_IDENTIFIER_VM_TIMEOUT_MS` to relax or tighten the VM evaluation timeout shared with the identifier harvester.【F:src/cli/generate-feather-metadata.js†L88-L212】【F:src/cli/options/manual-cache.js†L1-L19】【F:src/cli/generate-gml-identifiers.js†L1-L220】

## Upstream sources worth harvesting
1. **GameMaker Manual (YoYoGames/GameMaker-Manual)**
   - The manual repository already exposes multiple Feather-specific HTML topics: `Feather_Messages`, `Feather_Directives`, `Feather_Features`, `Feather_Data_Types`, and the IDE preference page that enumerates naming-rule controls.【6f027d†L1-L10】
   - `Feather_Messages` documents every GM1xxx/GM2xxx diagnostic with prose, fix guidance, and embedded code samples that we can parse into a structured rule catalogue.【3062ec†L1-L80】【f622c5†L1-L33】
   - `Feather_Settings` lists the configurable naming styles, prefixes/suffixes, and the linkage to GM2017, which is exactly the data we need to mirror Feather's naming policies.【702cf8†L31-L120】
   - `Feather_Directives` explains project-level overrides (`// Feather ignore …`, `// Feather use …`) including path glob syntax, so we can understand how to map diagnostics to suppressions and profiles.【40be1b†L1-L44】
   - `Feather_Data_Types` details the base types, specifiers, and collection syntax recognised by the language server, which we can lift to inform formatter-aware type hints later.【ec129e†L1-L80】
2. **Existing identifier harvesting script**
- `src/cli/generate-gml-identifiers.js` already solves the hard problems of manual ref resolution, caching, authenticated GitHub fetching, and file staging, so a Feather pipeline should reuse its helpers rather than reimplementing HTTP/caching logic.【F:src/cli/generate-gml-identifiers.js†L1-L220】

## Extraction pipeline outline
1. **Version selection & caching**
- Follow the identifier script's pattern: accept an explicit manual ref (flag + `GML_MANUAL_REF` env) or fall back to the latest release tag, resolve to a commit SHA, and reuse the manual cache tree (`scripts/cache/manual/<sha>/…`) so repeated runs are offline-friendly.【F:src/cli/generate-gml-identifiers.js†L40-L210】
2. **Data acquisition**
- Fetch the Feather HTML topics listed above via `fetchManualFile`, storing the raw HTML alongside the existing cached artefacts to avoid re-downloading when only parsing logic changes.【F:src/cli/generate-gml-identifiers.js†L240-L332】【6f027d†L1-L10】
   - Keep the fetch list configurable so we can add/remove topics without touching code (e.g. JSON manifest describing each page and the section(s) to extract).
3. **HTML parsing**
   - Use a resilient HTML parser (Cheerio or `linkedom`) to traverse headings, paragraphs, tables, and code blocks. RoboHelp exports are consistent (nested `<h3>`, `<p class="code">`, `<table>` blocks), so we can map DOM structures to structured records.
   - For `Feather_Messages`, group each `<h3>` diagnostic heading with subsequent prose, notes, and code samples until the next heading. Extract the rule ID, title, description, strict-mode annotations (`div[data-conref]`), and sample snippets. Preserve HTML-to-Markdown conversion so we can surface examples later.【3062ec†L1-L80】【f622c5†L1-L33】
   - For `Feather_Settings`, parse the Naming Rules section to enumerate selectable styles, prefix/suffix toggles, and the GM2017 dependency. This can become a schema like `{ identifierKind, namingStyleOptions, supportsPrefix, supportsSuffix, preserveUnderscores }` for downstream formatters.【702cf8†L71-L120】
   - For `Feather_Directives`, capture directive keywords (`ignore`, `use`), valid scope patterns, and documented examples so we can validate suppression comments and propose quick fixes.【40be1b†L1-L44】
   - For `Feather_Data_Types`, extract the base type list, specifier examples, and explanatory text so we can normalise Feather type annotations when generating documentation or enforcing formatter-aware heuristics.【ec129e†L1-L80】
4. **Normalisation & schema**
   - Define a JSON schema that groups diagnostics under `{ id, title, defaultSeverity?, description, notes[], examples[], strictModeOnly }`. Severity is not spelled out in the HTML, so leave it optional for now and plan a follow-up investigation into IDE config files once we locate them.
   - Emit separate top-level sections for `diagnostics`, `namingRules`, `directives`, and `types`. Include metadata (`manualRef`, `commitSha`, `generatedAt`, `source`) mirroring the identifier artefact for traceability.
5. **Tooling integration**
  - Ship `scripts/generate-feather-metadata.mjs`, sharing CLI ergonomics with the identifier generator and exposing it via `npm run build:feather-metadata` for easy regeneration and CI checks. Document the regeneration workflow alongside the identifier snapshot instructions in the [README](../README.md#regenerate-metadata-snapshots).
  - Write smoke tests that parse the generated JSON and assert that key sentinel rules (e.g. GM2017 naming rule) are present, flagging upstream changes early.

## Regeneration helper
- Run `npm run build:feather-metadata` to download the latest Feather topics into `resources/feather-metadata.json` using the cached manual snapshot under `scripts/cache/`.
- Pass `--ref <branch|tag|commit>` to target a specific manual revision, or `--force-refresh` to bypass the cache when fetching upstream files.
- See the [README regeneration guide](../README.md#regenerate-metadata-snapshots) for a condensed workflow and related tooling entry points.

## Open questions / future research
- The manual does not expose rule severity presets. We should inspect GameMaker IDE distributions (potentially via `@bscotch/stitch-launcher`) for config files that mirror the Message Severity table shown in the UI, so we can enrich the dataset in a later iteration.
- Investigate whether Feather ships additional machine-readable metadata (e.g. language server protocol definitions) that could be scraped once we have access to an IDE install; the current plan focuses on publicly accessible manual content to unblock formatter research quickly.
