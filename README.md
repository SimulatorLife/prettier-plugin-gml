# Prettier Plugin for GameMaker Language

> ⚠️ The formatter is experimental. Back up your GameMaker project or commit your work before running it across large codebases.

## Formatter at a glance

See how the plugin rewrites real GameMaker Language (GML) inputs. Each example links to the corresponding regression fixture used by the automated test suite so you can diff behaviour without running the formatter locally.

#### Struct consolidation & trailing comments

<table>
<thead>
<tr><th>Before</th><th>After</th></tr>
</thead>
<tbody>
<tr>
<td>

```gml
function trailing_comment() {
    var stats = {};
    stats.hp = 100; // base health
    stats.mp = 50;
    return stats;
}
```

</td>
<td>

```gml
/// @function trailing_comment
function trailing_comment() {
    var stats = {
        hp: 100, // base health
        mp: 50
    };
    return stats;
}
```

</td>
</tr>
</tbody>
</table>

<p align="right"><sub><a href="src/plugin/test/testStructs.input.gml#L31-L37">Input fixture</a> · <a href="src/plugin/test/testStructs.output.gml#L39-L48">Output fixture</a></sub></p>

#### Loop length hoisting

<table>
<thead>
<tr><th>Before</th><th>After</th></tr>
</thead>
<tbody>
<tr>
<td>

```gml
for(var i=0;i<ds_queue_size(queue);i+=1){
for(var j=0;j<array_length(arr);j+=1){
show_debug_message($"{i}x{j}");
}
}
```

</td>
<td>

```gml
var queue_count = ds_queue_size(queue);
for (var i = 0; i < queue_count; i += 1) {
    var arr_len = array_length(arr);
    for (var j = 0; j < arr_len; j += 1) {
        show_debug_message($"{i}x{j}");
    }
}
```

</td>
</tr>
</tbody>
</table>

<p align="right"><sub><a href="src/plugin/test/testHoist.input.gml">Input fixture</a> · <a href="src/plugin/test/testHoist.output.gml">Output fixture</a></sub></p>

---

## Documentation map

- [Documentation index](docs/README.md) &mdash; Jumping-off point for the design
  notes, rollout guides, and metadata playbooks that live alongside the
  formatter source. Each entry includes a short synopsis so you can scan for the
  right level of detail.
- [Sample `.prettierignore`](docs/examples/example.prettierignore) &mdash; Copy-
  ready ignore rules tuned for common GameMaker metadata folders when
  bootstrapping a project.
- [Contributor onboarding checklist](docs/contributor-onboarding.md) &mdash; Step-by-
  step environment setup, validation commands, and a tour of the workspace
  scripts for new contributors.
  when you need context on why the CLI and plugin expose separate entry points.
- [Semantic subsystem reference](src/semantic/README.md) &mdash; Details how the
  scope trackers and project-index coordinator live in the dedicated
  `gamemaker-language-semantic` workspace package.
- [Transpiler module outline](src/transpiler/README.md) &mdash; Stubbed entry point
  for the GML → JavaScript emitter that will feed the live reload pipeline as
  it matures.
- [Runtime wrapper plan](src/runtime-wrapper/README.md) &mdash; Notes on the browser
  hooks that accept transpiler patches and swap them into the running HTML5
  export.
- [Refactor engine scaffold](src/refactor/README.md) &mdash; Interim guidance for the
  semantic-safe rename engine that will orchestrate WorkspaceEdits.
- [ANTLR regeneration guide](docs/antlr-regeneration.md) &mdash; Walkthrough for
  rebuilding the generated parser sources with the vendored toolchain and
  understanding where custom extensions live.
- [Feather data plan](docs/feather-data-plan.md) &mdash; Scraper workflow for
  keeping the generated metadata in `resources/` current, plus validation steps
  for reviewing diffs before publishing updates. Use the
  `generate-feather-metadata` CLI command to refresh the dataset.
- [Live reloading concept](docs/live-reloading-concept.md) &mdash; Concept brief for
  the HTML5 runtime fork and watcher pipeline that powers in-place code reloads
  during gameplay. The `watch` CLI command now integrates with the transpiler to
  generate JavaScript patches when GML files change, providing the foundation for
  hot-reload development. See [CLI README](src/cli/README.md) for usage details.
- [Semantic scope plan](docs/semantic-scope-plan.md) &mdash; Roadmap for the
  ANTLR-based transpiler, semantic analysis, and dependency tracking that will
  feed the live reloading pipeline.

---

## Quick start

Confirm your runtime, then pick the install flow that matches how you plan to
use the formatter.

### 1. Verify prerequisites

- Node.js **25.0.0+**. Run `nvm use` against the bundled `.nvmrc` so local
  tooling matches CI. The workspace enforces the same floor across the parser,
  plugin, and CLI packages.
- npm (bundled with Node.js). Double-check availability with `node -v` and
  `npm -v`.

<details>
<summary><strong>Install Node.js with nvm</strong></summary>

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
export NVM_DIR="${XDG_CONFIG_HOME:-$HOME/.nvm}"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm install
nvm use
nvm alias default node
```

</details>

### 2. Install in a GameMaker project

1. Change into the directory that contains your `.yyp` file.
2. Pick the distribution that matches your workflow and configure Prettier to
   resolve the plugin consistently:

   #### Option A — Published npm release (plugin only)

   ```bash
   npm install --save-dev prettier@^3 antlr4@^4.13.2 prettier-plugin-gamemaker@latest
   ```

   Add the plugin to your Prettier configuration so editor integrations and
   `npx prettier` share the same parser wiring:

   ```json
   {
     "plugins": ["prettier-plugin-gamemaker"],
     "overrides": [
       {
         "files": "*.gml",
         "options": {
           "parser": "gml-parse"
         }
       }
     ]
   }
   ```

   Create a convenience script when you want a single command to format a
   project with the published package:

   ```jsonc
   {
     "scripts": {
       "format:gml": "prettier --plugin=prettier-plugin-gamemaker --write \"**/*.gml\""
     }
   }
   ```

   Run the script with `npm run format:gml -- --check` when you prefer dry-run
   enforcement.

   #### Option B — GitHub workspace / nightly build (includes CLI)

   ```bash
   npm install --save-dev "prettier@^3" "antlr4@^4.13.2" \
       github:SimulatorLife/prettier-plugin-gml#main
   ```

   Quote dependency specs in shells such as `zsh` so `^` is not treated as a
   glob. Pin a tag or commit (`#vX.Y.Z`, `#<sha>`) when you need reproducible CI
   builds. The Git dependency ships the same packages as the workspace, so the
   formatter entry point lives at `node_modules/root/src/plugin/src/plugin-entry.js` and
   the CLI wrapper at `node_modules/root/src/cli/src/cli.js`.

   ```jsonc
   {
     "plugins": [
       "./node_modules/root/src/plugin/src/plugin-entry.js"
     ]
   }
   ```

   Wire up a wrapper script so every teammate launches the bundled CLI the same
   way:

   ```jsonc
   {
     "scripts": {
       "format:gml": "node ./node_modules/root/src/cli/src/cli.js"
     }
   }
   ```

   Pass arguments with `npm run format:gml -- <flags>` so wrapper improvements
   propagate automatically. See
   [CLI wrapper environment knobs](#cli-wrapper-environment-knobs) for
   overrides such as `PRETTIER_PLUGIN_GML_PLUGIN_PATHS` when CI builds the
   plugin into a temporary directory.

   > Resolve `EBADENGINE` errors by upgrading Node.js to a supported release.

3. Run the formatter. The wrapper defaults to the current working directory when
   no path is provided. Pass `--help` to confirm which plugin entry was
   resolved and which extensions will run.

   ```bash
   # Using the wrapper script you defined above
   npm run format:gml
   npm run format:gml -- --check
   npm run format:gml -- --path . --extensions=.gml --extensions=.yy

   # Direct access to the bundled CLI (Git installs)
   node ./node_modules/root/src/cli/src/cli.js --help

   # Direct access to Prettier (npm installs)
   npx prettier --plugin=prettier-plugin-gamemaker --check "**/*.gml"
   ```

### 3. Use a local clone

1. Clone this repository and install dependencies:

   ```bash
   git clone https://github.com/SimulatorLife/prettier-plugin-gml.git
   cd prettier-plugin-gml
   nvm use
   npm ci
   ```

2. Run the aggregated validation once to confirm your local install matches CI
   before pointing the formatter at a project:

   ```bash
   npm run check
   ```

   The command runs the formatter smoke test, CI-mode lint, and the full Node.js
   test suite so new workstations start from a known-good baseline. Consult the
   [contributor onboarding checklist](docs/contributor-onboarding.md) for the
   individual suite commands when you need targeted reruns.

3. Format any GameMaker project without adding dependencies to that project. The
   repository exposes a dedicated `format:gml` script that targets the CLI's
   `format` command and defaults to the current working directory when no
   arguments are provided. Provide the target path explicitly when formatting
   elsewhere so the command formats the intended project:

   ```bash
   npm run format:gml -- /absolute/path/to/MyGame --extensions .gml --extensions .yy
   ```

   The wrapper also accepts an explicit `--path` flag when the target might be
   mistaken for a command name or begins with a hyphen. Running
   `npm run format:gml` without extra arguments formats the repository itself.

   The wrapper:

   - honours both repositories’ `.prettierrc` and `.prettierignore` files so
     local overrides apply alongside project-specific ignore rules.
   - prints skipped-file summaries with concrete examples of ignored,
     unsupported, and symlinked paths, plus guidance when no files match the
     configured extensions.
   - lets you cap skip examples with
     `--ignored-directory-sample-limit`/`--ignored-directory-samples`,
     `--ignored-file-sample-limit`, and
     `--unsupported-extension-sample-limit` or the matching
     `PRETTIER_PLUGIN_GML_*_SAMPLE_LIMIT` environment variables.
   - supports dry-run enforcement via `--check`, per-run parser recovery via
     `--on-parse-error=skip|abort|revert`, and log-level overrides through
     `--log-level` or their `PRETTIER_PLUGIN_GML_*` counterparts.
   - summarizes parser failures at the end of a run so you know to inspect the
     reported files and adjust the `--on-parse-error` strategy when needed.
   - respects additional extension lists from repeated `--extensions` flags (for
     example, `--extensions .gml --extensions .yy`) or the
     `PRETTIER_PLUGIN_GML_DEFAULT_EXTENSIONS` environment variable. Leave the
     flag unset to target `.gml` files only.
   - accepts either a positional path or the explicit `--path` option when you
     need to format outside the current working directory.

   Explore additional helpers with `npm run format:gml -- --help`,
   `npm run cli -- --help`, or the dedicated
   [CLI reference](#cli-wrapper-environment-knobs). Repeat `--extensions` to
   include additional file types (for example, `--extensions .gml --extensions .yy`
   to process both code and metadata files).

<details>
<summary><strong>Optional: global install</strong></summary>

```bash
npm install --global --save-exact prettier prettier-plugin-gamemaker
prettier --plugin=prettier-plugin-gamemaker --write "**/*.gml"
```

If you see an `ENOTDIR` error mentioning `node_modules/root`, remove any stale
folders created by previous installs and retry.

</details>

### 4. Validate your setup

Run these commands after dependency updates or when onboarding a new contributor.
Add `--extensions` when your project stores `.yy` metadata alongside `.gml`.

_Installed from npm_

```bash
npx prettier --plugin=prettier-plugin-gamemaker --support-info
npx prettier --plugin=prettier-plugin-gamemaker --check "**/*.gml"
```

_Installed from Git_

```bash
npx prettier --plugin=./node_modules/root/src/plugin/src/plugin-entry.js --support-info
npx prettier --plugin=./node_modules/root/src/plugin/src/plugin-entry.js --check "**/*.gml"
```

The `--support-info` output should list `gml-parse` under "Parsers" when the
plugin resolves correctly. Append `| grep gml-parse` on macOS or Linux, or use
`| Select-String gml-parse` in PowerShell, to filter the output if you prefer a
single-line confirmation.

```bash
npm run format:gml -- --extensions .gml --extensions .yy
node ./node_modules/root/src/cli/src/cli.js --help
npm run cli -- --help
```

Consult the archived [legacy identifier-case plan](docs/legacy-identifier-case-plan.md)
when you need historical context for automated renames, bootstrap behaviour,
cache hygiene, or dry-run reports. The active scope roadmap now resides in the
[live reloading concept](docs/live-reloading-concept.md).

### Contributor onboarding

Ready to contribute code or documentation changes? Work through the
[contributor onboarding checklist](docs/contributor-onboarding.md) for a guided
environment setup, validation commands, and a tour of the most common workspace
scripts before tackling feature work.

## Architecture overview

The repository is organised as a multi-package workspace so the parser, plugin,
and CLI can evolve together. Each package ships its own tests and CLI entry
points while sharing utilities via the `src/shared/src/` module.

| Package / folder | Location | Purpose |
| --- | --- | --- |
| `@gml-module/plugin` | `src/plugin/` | Prettier plugin entry point, printers, option handlers, CLI surface helpers, and regression fixtures. |
| `@gml-module/parser` | `src/parser/` | ANTLR grammar sources, generated parser output, and the parser test suite. |
| `@gml-module/cli` | `src/cli/` | Command-line interface (`cli.js`) for metadata generation, formatting wrapper commands, file watching for hot-reload pipeline, integration tests, and performance tooling. |
| `@gml-module/semantic` | `src/semantic/` | Semantic layer for tracking variable scope, project-index orchestration. |
| `@gml-module/core` | `src/core/` | Helper modules shared by the other packages/workspaces (AST utilities, string utilities, etc.). |
| `@gml-module/transpiler` | `src/transpiler/` | GML → JavaScript transpiler/emitter. |
| `@gml-module/runtime-wrapper` | `src/runtime-wrapper/` | Browser runtime hooks for live reloading during HTML5 gameplay. |
| `@gml-module/refactor` | `src/refactor/` | Semantic-safe rename engine. |
| Metadata snapshots | `resources/` | Generated datasets consumed by the formatter (identifier inventories, Feather metadata). |
| Documentation | `docs/` | Planning notes, rollout guides, and deep-dive references. Start with [`docs/README.md`](docs/README.md) for an index. |

The `npm run format:gml` script wires the CLI wrapper to the workspace copy of
Prettier so both local development and project integrations resolve the same
plugin entry. Regeneration helpers such as `npm run build:gml-identifiers` and
`npm run build:feather-metadata` refresh the datasets under `resources/` when the
upstream GameMaker releases change. See the [Development](#development) section
for the full suite of contributor commands.

Each workspace keeps its implementation under a `src/` directory and colocates
tests in a sibling `test/` directory. Generated assets stay sequestered under
`generated/` (for example the ANTLR output in `src/parser/generated/`). When a
package needs to publish transitional entry points, expose them via the
package's exports map rather than introducing new top-level directories so the
layout stays consistent.

> **Note:** All developer-facing utilities live under `src/cli/src/commands/`.
> When adding new helpers, expose them through the CLI instead of creating
> stand-alone scripts so contributors have a single, discoverable entry point.

---

## Everyday use

### Command-line snippets

- Format everything in the current project:

  ```bash
  npx prettier --plugin=prettier-plugin-gamemaker --write .
  ```

- Dry-run formatting for CI or pre-commit checks:

  ```bash
  npx prettier --plugin=prettier-plugin-gamemaker --check "rooms/**/*.gml"
  ```

- Format a single file:

  ```bash
  npx prettier --plugin=prettier-plugin-gamemaker --write scripts/player_attack.gml
  ```

- Use the wrapper helper (accepts the same flags as `npm run format:gml --`).
  Pass the project or file you want to format explicitly:

  ```bash
  npm run cli path/to/project
  ```

- Preview formatting changes without writing them back:

  ```bash
  npm run cli --check path/to/project
  ```

- Discover supported flags or double-check defaults:

  ```bash
  npm run cli --help
  ```

## Configuration reference

Keep overrides scoped to `.gml` files so other languages remain unaffected.

```json
{
  "plugins": ["prettier-plugin-gamemaker"],
  "overrides": [
    {
      "files": "*.gml",
      "options": {
        "printWidth": 120,
        "tabWidth": 4,
        "semi": true
      }
    }
  ]
}
```

Refer to the [Prettier configuration guide](https://prettier.io/docs/en/configuration.html) for the complete option list.

### Plugin-specific options

#### Core formatter behaviour

Optional parameters that rely on implicit `undefined` defaults are normalized: redundant `= undefined` sentinels are stripped from regular function declarations, while constructors and explicitly optional parameters keep the sentinel intact.

Template strings that never interpolate expressions automatically collapse back to regular quoted strings, stripping the `$` prefix so placeholder-free text stays concise.

| Option | Default | Summary |
| --- | --- | --- |
| `optimizeLoopLengthHoisting` | `true` | Hoists supported collection length checks out of `for` loop conditions and caches them in a temporary variable. |
| `condenseStructAssignments` | `true` | Converts consecutive struct property assignments into a single literal when comments and control flow permit it. |
| `loopLengthHoistFunctionSuffixes` | `""` | Override cached variable suffixes per function or disable hoisting for specific helpers. |
| `allowSingleLineIfStatements` | `false` | Enable to keep trivial `if` statements on one line. When disabled, only guard-style `if` statements that were already written on a single line stay collapsed; other bodies expand across multiple lines. |
| `logicalOperatorsStyle` | `"keywords"` | Choose `"symbols"` to keep `&&`/`||` instead of rewriting them to `and`/`or`. |
| `condenseLogicalExpressions` | `false` | Merges adjacent logical expressions that use the same operator. |
| `preserveGlobalVarStatements` | `true` | Keeps `globalvar` declarations while still prefixing later assignments with `global.`. |
| `alignAssignmentsMinGroupSize` | `3` | Aligns simple assignment operators across consecutive lines once the group size threshold is met. |
| `maxParamsPerLine` | `0` | Forces argument wrapping after the specified count (set to `0` to remove the numeric limit; nested callbacks may still wrap for readability). |
| `applyFeatherFixes` | `false` | Applies opt-in fixes backed by GameMaker Feather metadata (e.g. drop trailing semicolons from `#macro`). |
| `useStringInterpolation` | `true` | Upgrades eligible string concatenations to template strings (`$"Hello {name}"`). |
| `optimizeMathExpressions` | `false` | Optimize math expressions by converting bespoke patterns to built-ins, condensing scalar multipliers, and replacing divisions by constant values with multiplication by their reciprocal; this flag is responsible for normalizing `x / constant` expressions so the printer can treat them like multiplication chains without a hard-coded division-by-two branch. |

Line comments automatically drop YoYo Games' generated banner message (`Script assets have changed for v2.3.0 ... for more information`) and the default IDE stubs (`/// @description Insert description here`, `// You can write your code in this editor`) so repository diffs stay focused on deliberate edits instead of generated scaffolding.

> **Note:** The formatter intentionally enforces opinionated formatting for whitespace/line breaks. Legacy escape hatches such as `preserveLineBreaks` and the `maintain*Indentation` toggles were removed to keep formatting deterministic.

Bare struct literals now respect Prettier's [`objectWrap`](https://prettier.io/docs/en/options.html#object-wrap) option introduced in v3.5.0. When formatting GML, the plugin maps the behaviour directly onto struct literals:

- `objectWrap: "preserve"` (default) keeps the literal multi-line when the original source placed a newline immediately after `{`.
- `objectWrap: "collapse"` inlines eligible literals onto a single line when they fit within the configured `printWidth`.

```gml
// objectWrap: "preserve"
var enemy = {
    name: "Slime",
    hp: 5
};

// objectWrap: "collapse"
var enemy = {name: "Slime", hp: 5};
```

Bare decimal literals are always padded with leading and trailing zeroes (for
example, `.5` becomes `0.5` and `1.` becomes `1.0`) to improve readability.

Banner line comments that open with long runs of `/` characters are rewritten
into concise `//` comments. The formatter strips decorative separators (for
example `-----` or `====`) and collapses the remaining text to a single line;
rows that contain only decoration disappear. This mirrors Prettier's handling of
ASCII art headers so the output emphasizes the descriptive message instead of
banner scaffolding.

#### Project discovery & cache controls

The semantic subsystem coordinates project detection and cache persistence when
identifier casing is enabled. Use these options in tandem with the
[`src/semantic/README.md`](src/semantic/README.md) reference to keep CI and
monorepos predictable:

| Option | Default | Summary |
| --- | --- | --- |
| `gmlIdentifierCaseDiscoverProject` | `true` | Auto-detect the nearest `.yyp` manifest when bootstrapping the project index. Disable when callers manage discovery manually. This option is deprecated in favor of the new scoping/semantic plan described in [docs/semantic-scope-plan.md](docs/semantic-scope-plan.md). |
| `gmlIdentifierCaseProjectRoot` | `""` | Pin project discovery to an explicit directory. Helpful when formatting files outside the GameMaker project tree or when CI runs from ephemeral workspaces. This option is deprecated in favor of the new scoping/semantic plan described in [docs/semantic-scope-plan.md](docs/semantic-scope-plan.md). |
| `gmlIdentifierCaseProjectIndexCacheMaxBytes` | `8 MiB` | Cap the on-disk cache size written to `.prettier-plugin-gml/project-index-cache.json`. Increase alongside `GML_PROJECT_INDEX_CACHE_MAX_SIZE` when coordinating cache pruning yourself. This option is deprecated in favor of the new scoping/semantic plan described in [docs/semantic-scope-plan.md](docs/semantic-scope-plan.md). |
| `gmlIdentifierCaseProjectIndexConcurrency` | `4` | Control how many files the bootstrap parses in parallel. Combine with `GML_PROJECT_INDEX_CONCURRENCY` and `GML_PROJECT_INDEX_MAX_CONCURRENCY` to tune CI throughput without starving local machines. This option is deprecated in favor of the new scoping/semantic plan described in [docs/semantic-scope-plan.md](docs/semantic-scope-plan.md). |

Project index discovery, cache tuning, and concurrency controls live under
the [semantic subsystem](src/semantic/README.md) alongside scope-tracking
entry points.

---

## Development

### Repository layout (simplified)

```text
prettier-plugin-gml/
├─ src/parser/            # ANTLR grammar, generated parser
├─ src/plugin/            # Prettier plugin source, printer
├─ src/semantic/          # Scope trackers, project index coordinator
├─ src/refactor/          # Automated GML-project refactoring utilities (renaming identifiers, etc.)
├─ src/runtime-wrapper/   # Wraps the GML HTML5 runtime
├─ src/core/              # Shared/core utilities and types (AST helpers, string helpers, file helpers, etc.)
├─ src/cli/               # Command-line interface for all developer-facing utilities
├─ src/transpiler/        # Transpiles/emits JS from GML ASTs
├─ resources/             # Generated GML data consumed by various modules, ANTLR jar file
├─ vendor/                # Submodules for GameMaker runtime assets
└─ docs/                  # Design notes and guides
```

The Prettier plugin printer centralizes semicolon emission, cleanup, and statement-order helpers in `src/plugin/src/printer/semicolons.ts` so formatting heuristics stay in one place.

### Set up the workspace

```bash
git submodule update --init --recursive # pulls vendor/GameMaker-* runtime assets
nvm use # aligns your Node.js version with the workspace baseline
npm ci # installs dependencies from package-lock.json
```

If you prefer `npm install`, run it only after confirming the lockfile is up to date. The initial install wires up a local [Husky](https://typicode.github.io/husky/) pre-commit hook that runs `npm run format` and `npm run lint:fix`. Set `HUSKY=0` to bypass the hook when necessary (for example in CI environments).

### Commands Overview

```bash
# Run all tests
npm test

# Run tests for each package individually
npm run test:plugin
npm run test:parser
# etc.

# Run linting and formatting checks
npm run lint:fix
npm run format
npm run lint:ci

# Generate unit test report, checkstyle report, code coverage report, etc.
npm run report

# Regenerate metadata snapshots
npm run build:gml-identifiers
npm run build:feather-metadata

# Regenerate the parser grammar
# Install [ANTLR 4](https://www.antlr.org/download.html) and Java, then run:
npm run build:antlr

# Audit repository formatting without writes
npm run format:check

# Explore CLI utilities without switching directories
npm run cli -- --help

# Run the benchmarking helper
npm run cli -- performance
```

See [package.json](package.json) for the full list of available scripts.

---

## References / Tools / Docs

- [ANTLR4 Grammar Syntax Support](https://marketplace.visualstudio.com/items?itemName=mike-lischke.vscode-antlr4)
- [GML Support](https://marketplace.visualstudio.com/items?itemName=electrobrains.gml-support)
- [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)
- [Gemini CLI Configuration](https://github.com/google-gemini/gemini-cli/blob/main/docs/get-started/configuration.md)
- [jscpd CLI](https://github.com/kucherenko/jscpd/tree/master/apps/jscpd)
