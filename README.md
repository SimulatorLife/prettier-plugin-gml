# Prettier Plugin for GameMaker Language

> ⚠️ The formatter is experimental. Back up your GameMaker project or commit your work before running it across large codebases.

## Formatter at a glance

See how the plugin rewrites real GameMaker Language (GML) inputs. Each example links to the corresponding regression fixture used by the automated test suite so you can diff behaviour without running the formatter locally.

#### Legacy `#define` cleanup

<table>
<thead>
<tr><th>Before</th><th>After</th></tr>
</thead>
<tbody>
<tr>
<td>

```gml
#define  LEGACY_MACRO 123456789
#define region Utility Scripts
var util = function(val) {
        return val * LEGACY_MACRO;
}
#define    end region Utility Scripts
#define 123 not valid
```

</td>
<td>

```gml
#macro  LEGACY_MACRO 123456789

#region Utility Scripts

var util = function(val) {
    return val * LEGACY_MACRO;
};

#endregion Utility Scripts
```

</td>
</tr>
</tbody>
</table>

<p align="right"><sub><a href="src/plugin/test/define-normalization.input.gml">Input fixture</a> · <a href="src/plugin/test/define-normalization.output.gml">Output fixture</a></sub></p>

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

<p align="right"><sub><a href="src/plugin/test/testHoist.input.gml#L1-L6">Input fixture</a> · <a href="src/plugin/test/testHoist.output.gml#L1-L6">Output fixture</a></sub></p>

---

## Documentation map

- [Documentation index](docs/README.md) &mdash; Jumping-off point for the design
  notes, rollout guides, and metadata playbooks that live alongside the
  formatter source. Each entry includes a short synopsis so you can scan for the
  right level of detail.
- [Sample `.prettierignore`](docs/examples/example.prettierignore) &mdash; Copy-
  ready ignore rules tuned for common GameMaker metadata folders when you are
  bootstrapping a project.
- [Contributor onboarding checklist](docs/contributor-onboarding.md) &mdash; Step-by-
  step environment setup, validation commands, and a tour of the core
  workspace scripts for new teammates.
- [Architecture audit log](docs/architecture-audit-log.md) &mdash; Consolidated
  repository health checks with dated entries. The scheduled
  `codex-78-architectural-audit` workflow appends its results here instead of
  opening per-day files. Review the October 23, 2025 audit and prior
  follow-ups, plus the
  [shared module layout refresh](docs/shared-module-layout.md) for historical
  context around the `src/shared/src/` consolidation. Pair it with the
  [interface segregation investigation](docs/interface-segregation-investigation.md)
  when you need a refresher on why the CLI and plugin expose separate entry
  points.
- [Semantic subsystem reference](src/semantic/README.md) &mdash; Details how the
  scope trackers and project-index coordinator now live in the dedicated
  `gamemaker-language-semantic` workspace package.
- [ANTLR regeneration guide](docs/antlr-regeneration.md) &mdash; Walkthrough for
  rebuilding the generated parser sources with the vendored toolchain and
  understanding where custom extensions live now that the grammar delegates to
  extracted helpers.
- [Legacy identifier-case plan](docs/legacy-identifier-case-plan.md) &mdash; Archived
  summary of the previous rename pipeline, scope coverage, rollout workflow, and
  tricky identifier examples. Use it for historical context; the current roadmap
  now spans the [live reloading concept](docs/live-reloading-concept.md) and the
  [semantic scope plan](docs/semantic-scope-plan.md).
- [Project index cache design](docs/legacy-identifier-case-plan.md#project-index-cache-design) &mdash; Design
  notes and cache architecture guidance preserved alongside the archived
  [project index roadmap](docs/legacy-identifier-case-plan.md#archived-project-index-roadmap).
- [Feather data plan](docs/feather-data-plan.md) &mdash; Scraper workflow for
  keeping the generated metadata in `resources/` current, plus validation steps
  for reviewing diffs before publishing updates. Pair it with the
  [reserved identifier metadata hook overview](docs/reserved-identifier-metadata-hook.md)
  when staging bespoke metadata sources, generated code directories, or
  regeneration scripts.
- [Live reloading concept](docs/live-reloading-concept.md) &mdash; Concept brief for
  the HTML5 runtime fork and watcher pipeline that powers in-place code reloads
  during gameplay. Use it alongside the architecture audits when evaluating
  runtime tooling work.
- [Semantic scope plan](docs/semantic-scope-plan.md) &mdash; Roadmap for the
  ANTLR-based transpiler, semantic analysis, and dependency tracking that feed
  the live reloading pipeline.
- Formatter extension hooks &mdash;
  [line-comment resolver](docs/line-comment-options-resolver-hook.md),
  [doc comment type normalization hook](docs/doc-comment-type-normalization-hook.md),
  [statement newline padding extension](docs/statement-newline-padding-extension.md), and
  [core option overrides resolver](docs/core-option-overrides-hook.md) seams that
  let integrators run controlled experiments without permanently widening the
  public option surface. Combine them with targeted
  `setProjectIndexSourceExtensions` overrides when bespoke suffixes (for
  example, `.npc.gml`) need to participate in rename plans.
- [Memory experiments](docs/metrics-tracker-finalize-memory.md) &mdash; Captures the
  `node --expose-gc` script and before/after measurements that validate the
  metrics tracker clean-up path.

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
   formatter entry point lives at `node_modules/root/src/plugin/src/gml.js` and
   the CLI wrapper at `node_modules/root/src/cli/src/cli.js`.

   ```jsonc
   {
     "plugins": [
       "./node_modules/root/src/plugin/src/gml.js"
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
   npm run format:gml -- /absolute/path/to/MyGame --extensions=.gml --extensions=.yy
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
   - respects additional extension lists from repeated `--extensions` flags or
     `PRETTIER_PLUGIN_GML_DEFAULT_EXTENSIONS`. Leave the flag unset to target
     `.gml` only.
   - accepts either a positional path or the explicit `--path` option when you
     need to format outside the current working directory.

   Explore additional helpers with `npm run format:gml -- --help`,
   `npm run cli -- --help`, or the dedicated
   [CLI reference](#cli-wrapper-environment-knobs). Repeat `--extensions` to
   append more groups alongside the comma- or path-delimiter-separated form, or add `--extensions=.yy`
   when you also want to process metadata files.

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

Run these commands after dependency updates or when onboarding a teammate. Add
`--extensions` only when your project stores `.yy` metadata alongside `.gml`.

_Installed from npm_

```bash
npx prettier --plugin=prettier-plugin-gamemaker --support-info
npx prettier --plugin=prettier-plugin-gamemaker --check "**/*.gml"
```

_Installed from Git_

```bash
npx prettier --plugin=./node_modules/root/src/plugin/src/gml.js --support-info
npx prettier --plugin=./node_modules/root/src/plugin/src/gml.js --check "**/*.gml"
```

The `--support-info` output should list `gml-parse` under "Parsers" when the
plugin resolves correctly. Append `| grep gml-parse` on macOS or Linux, or use
`| Select-String gml-parse` in PowerShell, to filter the output if you prefer a
single-line confirmation.

```bash
npm run format:gml -- --extensions=.gml --extensions=.yy
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
environment setup, sanity checks, and a tour of the most common workspace
scripts before tackling feature work.

## Architecture overview

The repository is organised as a multi-package workspace so the parser, plugin,
and CLI can evolve together. Each package ships its own tests and CLI entry
points while sharing utilities via the `src/shared/src/` module.

| Package / folder | Location | Purpose |
| --- | --- | --- |
| `prettier-plugin-gamemaker` | `src/plugin/` | Prettier plugin entry point (`src/gml.js`), printers, option handlers, CLI surface helpers, and regression fixtures. |
| `gamemaker-language-parser` | `src/parser/` | ANTLR grammar sources, generated parser output, and the parser test suite. |
| `prettier-plugin-gml-cli` | `src/cli/` | Command-line interface (`cli.js`) for metadata generation, formatting wrapper commands, integration tests, and performance tooling. |
| `gamemaker-language-semantic` | `src/semantic/` | Scope trackers, project-index orchestration, rename bootstrap controls, and the semantic test suite. |
| Shared modules | `src/shared/src/` | Helper modules shared by the plugin, CLI, parser, and semantic packages (AST utilities, identifier casing primitives, string helpers). |
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

  > **Workspace installs:** Replace the `--plugin` specifier with
  > `./node_modules/root/src/plugin/src/gml.js` when the repository is vendored
  > directly into `node_modules/root/`.

- Use the wrapper helper (accepts the same flags as `npm run format:gml --`).
  Pass the project or file you want to format explicitly:

  ```bash
  node ./node_modules/root/src/cli/src/cli.js format path/to/project --extensions=.gml --extensions=.yy
  ```

- Preview formatting changes without writing them back:

  ```bash
  node ./node_modules/root/src/cli/src/cli.js --check
  ```

- Discover supported flags or double-check defaults:

  ```bash
  node ./node_modules/root/src/cli/src/cli.js --help
  ```

- Inspect formatter-specific switches:

  ```bash
  node ./node_modules/root/src/cli/src/cli.js format --help
  ```

- Check the wrapper version label surfaced by `--version` or `-V`:

  ```bash
  node ./node_modules/root/src/cli/src/cli.js --version
  ```

### CLI wrapper environment knobs

The wrapper honours environment variables so CI systems can tune behaviour
without editing project scripts:

- `PRETTIER_PLUGIN_GML_DEFAULT_EXTENSIONS` &mdash; Overrides the implicit
  extension list used when `--extensions` is omitted. The wrapper defaults to formatting `.gml` only when neither the flag nor the environment variable is present.
- `PRETTIER_PLUGIN_GML_LOG_LEVEL` &mdash; Sets the default Prettier log level
  when the wrapper runs without `--log-level`. Accepted values mirror Prettier:
  `debug`, `info`, `warn`, `error`, or `silent`.
- `PRETTIER_PLUGIN_GML_ON_PARSE_ERROR` &mdash; Sets the default
  `--on-parse-error` strategy (`skip`, `revert`, or `abort`).
- `PRETTIER_PLUGIN_GML_SKIPPED_DIRECTORY_SAMPLE_LIMIT` &mdash; Caps how many
  ignored directories appear in the summary when the wrapper honours
  `.prettierignore` entries. Combine with
  `--ignored-directory-sample-limit` (or `--ignored-directory-samples`) for
  per-run overrides.
- `PRETTIER_PLUGIN_GML_IGNORED_FILE_SAMPLE_LIMIT` &mdash; Limits how many
  ignored files appear in the inline skip logs and summary examples. Combine
  with `--ignored-file-sample-limit` for per-run overrides.
- `PRETTIER_PLUGIN_GML_UNSUPPORTED_EXTENSION_SAMPLE_LIMIT` &mdash; Limits how many
  example files appear in the unsupported-extension summary. Pair with
  `--unsupported-extension-sample-limit` when tuning individual runs.
- `PRETTIER_PLUGIN_GML_PLUGIN_PATHS` (or the singular `PRETTIER_PLUGIN_GML_PLUGIN_PATH`) &mdash;
  Adds repository-relative or absolute plugin entry point paths for the wrapper
  to consider before falling back to its built-in candidates. Useful when CI
  jobs build the plugin into a temporary directory.
- `PRETTIER_PLUGIN_GML_SKIP_CLI_RUN` &mdash; Set to `1` when bundlers or test
  harnesses import the CLI module but should not automatically execute a
  command. The wrapper still registers commands so manual runs work once the
  flag is cleared.
- `PRETTIER_PLUGIN_GML_PRETTIER_MODULE` &mdash; Overrides the module specifier used
  to resolve Prettier. Handy when the formatter runs inside a monorepo with a
  custom Prettier build or when you pin a nightly via a local alias.
- `PRETTIER_PLUGIN_GML_VERSION` &mdash; Injects the version label surfaced by
  `node ./node_modules/root/src/cli/src/cli.js --version`. Handy when mirroring
  release tags or packaging nightly builds.

### Formatter environment knobs

The formatter honours a small set of environment variables for teams that need
to tune formatting behaviour without patching the plugin:

- `PRETTIER_PLUGIN_GML_DOC_COMMENT_MAX_WRAP_WIDTH` &mdash; Caps the width used when
  wrapping GameMaker doc comments. Increase the value to preserve wider manual
  descriptions or set it to `Infinity` to fall back to Prettier's configured
  `printWidth`.

### Visual Studio Code

1. Install the [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) extension.
2. Install a GML language service such as [GML Support](https://marketplace.visualstudio.com/items?itemName=electrobrains.gml-support).
3. Ensure the workspace `package.json` lists `prettier`, `antlr4`, and either the
   npm package (`prettier-plugin-gamemaker`) or the Git dependency so VS Code can
   resolve the plugin.
4. Enable format-on-save:

   ```json
   {
     "editor.formatOnSave": true,
     "[gml]": {
       "editor.defaultFormatter": "esbenp.prettier-vscode"
     }
   }
   ```

---

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

Refer to the [Prettier configuration guide](https://prettier.io/docs/en/configuration.html) for the complete option list. GameMaker-specific overrides live alongside your `.yyp` so both the CLI and editor integrations share a single source of truth.

> **Workspace installs:** When you track `main` directly from GitHub, swap the
> plugin entry for `"./node_modules/root/src/plugin/src/gml.js"` so Prettier
> resolves the bundled workspace build.

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
| `variableBlockSpacingMinDeclarations` | `4` | Inserts a blank line after runs of local declarations once the specified length is met; set to `0` to disable the spacing entirely. |
| `lineCommentBannerLength` | `60` | Sets the normalized width for banner line comments; set to `0` to keep the original slash run. |
| `maxParamsPerLine` | `0` | Forces argument wrapping after the specified count (set to `0` to remove the numeric limit; nested callbacks may still wrap for readability). |
| `applyFeatherFixes` | `false` | Applies opt-in fixes backed by GameMaker Feather metadata (e.g. drop trailing semicolons from `#macro`). |
| `useStringInterpolation` | `false` | Upgrades eligible string concatenations to template strings (`$"Hello {name}"`). |
| `convertDivisionToMultiplication` | `false` | Rewrites division by literals into multiplication by the reciprocal when safe. |
| `convertManualMathToBuiltins` | `false` | Collapses bespoke math expressions into their equivalent built-in helpers (for example, turn repeated multiplication into `sqr()`). |
| `condenseUnaryBooleanReturns` | `false` | Reserved for future unary boolean condensation logic; currently exposed but has no effect. |
| `condenseReturnStatements` | `false` | Reserved placeholder for boolean return condensation and presently a no-op. |

Line comments automatically drop YoYo Games' generated banner message (`Script assets have changed for v2.3.0 ... for more information`) and the default IDE stubs (`/// @description Insert description here`, `// You can write your code in this editor`) so repository diffs stay focused on deliberate edits instead of generated scaffolding.

> **Note:** The formatter intentionally enforces canonical whitespace. Legacy escape hatches such as `preserveLineBreaks` and the `maintain*Indentation` toggles were removed to keep formatting deterministic.

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

Bare decimal literals are always padded with leading and trailing zeroes to improve readability.

Banner line comments are automatically detected when they contain five or more consecutive `/` characters. Once identified, the formatter rewrites the banner prefix to the `lineCommentBannerLength` setting (60 by default) so mixed-width comment markers settle on a single, readable standard; set the option to `0` to leave banner widths untouched.

#### Identifier-case rollout

| Option | Default | Summary |
| --- | --- | --- |
| `gmlIdentifierCase` | `"off"` | Enables automated identifier casing across scopes; review the rollout guide before activating on large projects. |
| `gmlIdentifierCase<Scope>` | `"inherit"` | Scope overrides such as `gmlIdentifierCaseLocals` or `gmlIdentifierCaseGlobals`; each accepts the same style choices as the base option. |
| `gmlIdentifierCaseIgnore` | `""` | Comma- or newline-separated list of identifiers or glob patterns that should never be renamed. |
| `gmlIdentifierCasePreserve` | `""` | Locks specific identifiers to their original spelling even when a new style is enabled. |
| `gmlIdentifierCaseAcknowledgeAssetRenames` | `false` | Required confirmation before asset renames update `.yy` metadata and on-disk file names. |
| `gmlIdentifierCaseOptionStoreMaxEntries` | `128` | Caps the identifier-case option store size; set to `0` to keep all historical entries without eviction. |

#### Project discovery & cache controls

The semantic subsystem coordinates project detection and cache persistence when
identifier casing is enabled. Use these options in tandem with the
[`src/semantic/README.md`](src/semantic/README.md) reference to keep CI and
monorepos predictable:

| Option | Default | Summary |
| --- | --- | --- |
| `gmlIdentifierCaseDiscoverProject` | `true` | Auto-detect the nearest `.yyp` manifest when bootstrapping the project index. Disable when callers manage discovery manually. |
| `gmlIdentifierCaseProjectRoot` | `""` | Pin project discovery to an explicit directory. Helpful when formatting files outside the GameMaker project tree or when CI runs from ephemeral workspaces. |
| `gmlIdentifierCaseProjectIndexCacheMaxBytes` | `8 MiB` | Cap the on-disk cache size written to `.prettier-plugin-gml/project-index-cache.json`. Increase alongside `GML_PROJECT_INDEX_CACHE_MAX_SIZE` when coordinating cache pruning yourself. |
| `gmlIdentifierCaseProjectIndexConcurrency` | `4` | Control how many files the bootstrap parses in parallel. Combine with `GML_PROJECT_INDEX_CONCURRENCY` and `GML_PROJECT_INDEX_MAX_CONCURRENCY` to tune CI throughput without starving local machines. |

Project index discovery, cache tuning, and concurrency controls now live under
the [semantic subsystem](src/semantic/README.md) alongside the new scope-tracking
entry points.

Additional automation hooks such as `identifierCaseProjectIndex`,
`identifierCaseDryRun`, and `identifierCaseReportLogPath` remain captured in the
[legacy identifier-case plan](docs/legacy-identifier-case-plan.md). Projects that
checkpoint GML under bespoke suffixes can extend the recognised source list with
`setProjectIndexSourceExtensions`; refer to the helper's inline JSDoc for
supported workflows.

---

## Identifier case rollout

1. **Enable identifier casing** in your Prettier configuration. Start with the
   [locals-first configuration](docs/legacy-identifier-case-plan.md#locals-first-configuration-script)
   so other scopes stay in observation mode.
2. **Warm the project index cache** (see the [semantic subsystem](src/semantic/README.md) for discovery and cache controls) by running the formatter once with your target project path. The bootstrap automatically creates `.prettier-plugin-gml/project-index-cache.json` the first time a rename-enabled scope executes. Use the example configuration above when you want to script a manual snapshot or commit a deterministic JSON index for CI.
3. **Dry-run renames** with locals-first safety nets before writing changes to disk. Keep `identifierCaseDryRun` enabled and capture logs via `identifierCaseReportLogPath` until you are comfortable with the rename summaries.
4. **Promote renames** to write mode once you are satisfied with the preview and have backups ready.
5. **Follow the migration checklist** preserved in
   `docs/legacy-identifier-case-plan.md` to confirm that assets, macros, and
   globals were acknowledged.

---

## Troubleshooting

- Formatter fails to load the plugin → confirm the explicit `plugins` entry in your Prettier configuration.
- Wrapper reports "Unable to locate the Prettier plugin entry point" → point the CLI at additional build locations with `PRETTIER_PLUGIN_GML_PLUGIN_PATHS` or update the script’s `node_modules/root/...` path to match your installation layout.
- `npm install` reports `EBADENGINE` → upgrade Node.js to 25.0.0+.
- Wrapper skips files unexpectedly → inspect the skipped-file summary and adjust `.prettierignore` or `--extensions` accordingly.
- Parser errors → rerun with `--on-parse-error=revert` to preserve original files, then report the issue with the offending snippet.
- Identifier-case bootstrap stuck on stale data → delete `.prettier-plugin-gml/project-index-cache.json` or set `gmlIdentifierCaseProjectRoot` explicitly before rerunning.

---

## Development

### Repository layout

```
prettier-plugin-gml/
├─ src/parser/        # ANTLR grammar, generated parser, and parser tests
├─ src/plugin/        # Prettier plugin source, printer, CLI wrapper, and plugin tests
├─ src/semantic/      # Scope trackers, project index coordinator, semantic tests
├─ src/shared/        # Shared utilities (AST helpers, identifier casing, CLI plumbing)
│  ├─ src/            # Runtime modules consumed by other packages
│  └─ test/           # Tests covering shared primitives
├─ resources/         # Generated metadata consumed by the formatter
├─ docs/              # Design notes and rollout guides
└─ package.json       # Workspace manifest with scripts and shared tooling
```

All developer automation should be exposed through the CLI entry points in
`src/cli/src/commands/`. Avoid adding stand-alone scripts elsewhere in the
repository so new tooling remains easy to discover and maintain.

### Set up the workspace

```bash
nvm use # aligns your Node.js version with the workspace baseline
npm ci # installs dependencies from package-lock.json
```

If you prefer `npm install`, run it only after confirming the lockfile is up to date. The initial install wires up a local [Husky](https://typicode.github.io/husky/) pre-commit hook that runs `npm run format` and `npm run lint:fix`. Set `HUSKY=0` to bypass the hook when necessary (for example in CI environments).

### Test the plugin and parser

```bash
npm test
npm run check
npm run test:plugin
npm run test:parser
npm run test:semantic
npm run test:shared
npm run test:cli
npm run lint
npm run lint:ci
npm run format:check
npm run lint:fix
```

`npm run check` chains the formatter audit, lint (CI mode), and full test suite.
All suites run on [Node.js’s built-in test runner](https://nodejs.org/api/test.html);
append `-- --watch` to any `npm run test --workspace …` command for watch mode.

#### Checkstyle lint reports

`npm run lint:report` relies on ESLint's built-in `checkstyle` formatter to
produce the XML file parsed by the GitHub automerge workflow. The formatter is
available out of the box, so the script works in local development environments
and CI without any extra packages.

Fixtures under `src/plugin/test` and `src/parser/test/input` are golden. Update them only when deliberately changing formatter output or parser behaviour.

### Regenerate metadata snapshots

```bash
npm run build:gml-identifiers
npm run build:feather-metadata
```

Both commands accept `--ref <branch|tag|commit>` to target a specific manual revision and `--force-refresh` to bypass cached downloads stored in `scripts/cache/manual/`. Use `--progress-bar-width <n>` (or `GML_PROGRESS_BAR_WIDTH`) to tune the terminal progress indicator and `--vm-eval-timeout-ms <ms>` (or `GML_IDENTIFIER_VM_TIMEOUT_MS`, with `GML_VM_EVAL_TIMEOUT_MS` available to change the global default) to adjust the manual array evaluation timeout.

### Regenerate the parser grammar

Install [ANTLR 4](https://www.antlr.org/download.html) and Java, then run:

```bash
npm run build:antlr
```

### Handy development commands

```bash
npm run example:plugin      # Format a fixture with the development build
npm run format:check        # Audit repository formatting without writes
npm --prefix src/plugin run prettier:plugin -- --path=test/test14.input.gml
npm run cli -- --help       # Explore CLI utilities without switching directories
npm run cli -- performance  # Run the benchmarking helpers registered with the CLI
npm run memory -- --suite normalize-string-list --pretty      # Measure normalizeStringList memory usage
npm run report              # Generate unit test report, checkstyle report (using the eslint-formatter-checkstyle formatter), and code coverage report.
```

Omit `--suite` to run every available memory suite; use `npm run memory -- --help` to review the full list of benchmarks.

Tune the memory suites with environment variables when scripting CI runs:
`GML_MEMORY_ITERATIONS` adjusts the default iteration count, while
`GML_MEMORY_PARSER_MAX_ITERATIONS` and `GML_MEMORY_FORMAT_MAX_ITERATIONS`
cap the parser and formatter hot loops respectively when a suite requests more
work than the configured ceiling.

---

## Useful VS Code extensions

- [ANTLR4 Grammar Syntax Support](https://marketplace.visualstudio.com/items?itemName=mike-lischke.vscode-antlr4)
- [GML Support](https://marketplace.visualstudio.com/items?itemName=electrobrains.gml-support)
