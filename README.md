# Prettier Plugin for GameMaker Language

<p align="center">
  <a href="https://github.com/SimulatorLife/prettier-plugin-gml/issues">
    <img alt="GitHub Issues" src="https://img.shields.io/github/issues/SimulatorLife/prettier-plugin-gml">
  </a>
</p>

A [Prettier](https://prettier.io/) plugin that understands [GameMaker Language](https://manual.gamemaker.io/) (GML) files. This
repository bundles the parser, printer, generated metadata, and shared helpers in one npm workspace so scripts, objects, and shaders
all benefit from the same formatter. The plugin is not yet published on npm; install it straight from GitHub using the
instructions below. The formatter package (`prettier-plugin-gamemaker`) ships inside this workspace, so Prettier needs an
explicit path to load it when you install from Git. Prefer an overview of the supporting tools? Start with the
[documentation index](docs/README.md) for links to naming guides, rollout playbooks, and metadata plans.

> ⚠️ The formatter is still experimental. Commit your work or keep backups handy before formatting large projects.

## Table of contents

- [Quick start](#quick-start)
  - [Requirements](#requirements)
  - [Install](#install)
  - [Format code](#format-code)
  - [Format with a local clone](#format-with-a-local-clone)
  - [Optional: global install](#optional-global-install)
  - [Validate your setup](#validate-your-setup)
- [Usage tips](#usage-tips)
  - [Command line](#command-line)
  - [Visual Studio Code](#visual-studio-code)
  - [Configuration reference](#configuration-reference)
- [Identifier case rollout](#identifier-case-rollout)
  - [Generate a project index](#generate-a-project-index)
  - [Dry-run locals-first renames](#dry-run-locals-first-renames)
  - [Promote renames to write mode](#promote-renames-to-write-mode)
  - [Migration checklist](#migration-checklist)
- [Troubleshooting](#troubleshooting)
- [Architecture overview](#architecture-overview)
- [Development](#development)
  - [Repository layout](#repository-layout)
  - [Set up the workspace](#set-up-the-workspace)
  - [Test the plugin and parser](#test-the-plugin-and-parser)
  - [Regenerate metadata snapshots](#regenerate-metadata-snapshots)
  - [Regenerate the parser grammar](#regenerate-the-parser-grammar)
  - [Handy development commands](#handy-development-commands)
- [Useful VS Code extensions](#useful-vs-code-extensions)

## Quick start

> Want the shortest path? Install the dependency next to your GameMaker project and run the bundled wrapper:
>
> ```bash
> cd /path/to/MyGameProject
> npm install --save-dev prettier "antlr4@^4.13.2" "github:SimulatorLife/prettier-plugin-gml#main"
> node ./node_modules/root/src/plugin/prettier-wrapper.js --path .
> ```
>
> The sections below expand on each step, add IDE tips, and show how to run the formatter from a local clone of this repository.

### Requirements

- Node.js **18.18.0** or newer (20.9.0+ recommended to track the latest LTS). The plugin targets Prettier 3, so older Node
  releases that only support Prettier 2 will not work. Use the bundled `.nvmrc` when you want to align with the repository’s
  expected runtime:

  ````bash
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash

  export NVM_DIR="$([ -z "${XDG_CONFIG_HOME-}" ] && printf %s "${HOME}/.nvm" || printf %s "${XDG_CONFIG_HOME}/nvm")"
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
  nvm install
  nvm use
  ````

- npm (ships with Node.js). Confirm availability with:

  ```bash
  node -v
  npm -v
  ```

### Install

1. Change into the root folder of the GameMaker project you want to format (the directory that contains your `.yyp` file).

   > 💡 **Install the plugin next to the project you want to format.** Prettier only loads plugins that live alongside the
   > project being formatted, so avoid installing from a shared tooling repo.

2. Add Prettier, the plugin, and the parser runtime to your GameMaker project. Run the install command from the directory that
   contains your `.yyp` manifest so the dependency lands next to your GameMaker sources:

   ```bash
   npm install --save-dev prettier "antlr4@^4.13.2" "github:SimulatorLife/prettier-plugin-gml#main"
   ```

   - Quote the dependency strings so shells such as `zsh` do not expand the `^` character as a glob.
   - If `npm` reports an `EBADENGINE` warning or refuses to install, upgrade to a supported Node.js release (18.18.0+, 20.9.0+,
     or 21.1.0+). `nvm install --lts` is an easy way to pull the latest compatible runtime.

   `npm` creates a `package.json` for you when the project does not already have one. Keep the generated `node_modules`
   folder next to your project so the Git-based dependency remains discoverable. The dependency installs into
   `node_modules/root`, matching the name defined in this repository’s workspace manifest. Pin the dependency to a tag or commit
   (for example `github:SimulatorLife/prettier-plugin-gml#<commit>`) if you want reproducible installs.

3. Because the package is installed directly from GitHub, Prettier cannot auto-detect it. Point Prettier at the bundled plugin
   entry (`node_modules/root/src/plugin/src/gml.js`) by wiring either a script or an explicit configuration:

   ```jsonc
   {
     "scripts": {
       "format:gml": "prettier --plugin=./node_modules/root/src/plugin/src/gml.js --write \"**/*.gml\""
     }
   }
   ```

   Add an explicit override if you want to pin `.gml` files to the bundled parser or customise options per language. Including
   the plugin path in your Prettier configuration keeps editor integrations working even when the CLI script is not used.
   Place a Prettier config file (`.prettierrc`, `.prettierrc.json`, `.prettierrc.yml`, `prettier.config.{js,cjs,mjs}`, or the
   `prettier` field inside `package.json`) in the root of your GameMaker project so both the CLI and editor extensions share the
   same settings:

   ```json
   {
     "plugins": ["./node_modules/root/src/plugin/src/gml.js"],
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

   Add any GameMaker-specific options—such as `gmlIdentifierCase`,
   `useStringInterpolation`, or project-wide `tabWidth` overrides—to that same
   config file and Prettier will apply them whenever it formats files from your
   project directory. Remember that Prettier only reads configuration files
   placed at or above the directory you run it from, so keeping the config next
   to your `.yyp` ensures consistent behaviour for the CLI and IDE integrations.

  > 📘 Want a deeper dive on identifier renaming? Start with the
  > [Identifier Case & Naming Convention Guide](docs/naming-conventions.md) and
  > the [identifier-case rollout playbook](docs/identifier-case-rollout.md).
  > The [documentation index](docs/README.md) links to additional background
  > notes and curated examples that walk through the exact tokenisation and
  > casing rules applied by `gmlIdentifierCase`.

   Running the wrapper from a local clone of this repository automatically picks up that project-level config. For example, if
   you clone the plugin and execute:

   ```bash
   npm run format:gml -- --path "/path/to/YourGame"
   ```

   the wrapper resolves `/path/to/YourGame/.prettierrc`, merges any overrides (such as `semi`, `applyFeatherFixes`,
   `condenseLogicalExpressions`, `optimizeLoopLengthHoisting`, or `condenseStructAssignments`), and applies them while keeping
   the plugin path and parser locked to the bundled defaults. You only need to add the explicit `plugins` entry inside the
   GameMaker project if you also intend to run Prettier directly from that project’s workspace (for instance via `npx prettier`
   or an editor integration that does not go through the wrapper).

   The plugin defaults to `tabWidth: 4`, `semi: true`, `trailingComma: "none"`, `printWidth: 120`, and enables
   `optimizeLoopLengthHoisting`. Override these values in your configuration to match your team conventions. Prefer a single
   entry point? Use the bundled wrapper instead of wiring Prettier manually:

   ```bash
   node ./node_modules/root/src/plugin/prettier-wrapper.js --path .
   ```

   The wrapper mirrors the CLI behaviour, automatically reuses your project’s `.prettierrc` overrides, and formats every file
   matching the configured extensions (defaulting to `.gml`, or the comma-separated list provided via the
   `PRETTIER_PLUGIN_GML_DEFAULT_EXTENSIONS` environment variable). Pass `--extensions=.gml,.yy` to format additional file types
   in a single run. The helper also honours `.prettierignore` entries from both repositories, skips symbolic links, and prints a
   summary of skipped paths so you can confirm non-GML assets stayed untouched.

4. Keep the package up to date alongside Prettier. Re-run the install command whenever you want to pull a newer revision of the
   plugin:

   ```bash
   npm install --save-dev prettier "antlr4@^4.13.2" "github:SimulatorLife/prettier-plugin-gml#main"
   ```

   Re-running `npm install` after a GameMaker update helps ensure the parser matches the latest language features.

### Format code

Run Prettier from the same project directory where you installed the packages, or wire it into your build scripts. The
package exposes Prettier 3’s standard CLI entry points, so the script above lets you run:

```bash
npm run format:gml
```

Prefer the raw CLI? Pass the plugin path explicitly:

```bash
npx prettier --plugin=./node_modules/root/src/plugin/src/gml.js --write "**/*.gml"
```

Want the wrapper to drive everything for you (including `.prettierignore` support and multi-extension runs)? Provide the
target project path directly:

```bash
node ./node_modules/root/src/plugin/prettier-wrapper.js --path . --extensions=.gml,.yy
```

If `--extensions` is omitted the wrapper falls back to the `.gml` default or to the comma-separated list provided via the
`PRETTIER_PLUGIN_GML_DEFAULT_EXTENSIONS` environment variable.

<details>
<summary><strong>Before formatting</strong></summary>

```gml
var enemy = argument0; var damage = argument1

with(enemy)
{
          self.hp-=damage
        if(self.hp<=0){instance_destroy(self)}
}
```

</details>

<details>
<summary><strong>After formatting</strong></summary>

```gml
var enemy = argument0;
var damage = argument1;

with (enemy) {
    self.hp -= damage;
    if (self.hp <= 0) {
        instance_destroy(self);
    }
}
```

</details>

### Format with a local clone

If you already have this repository cloned, you can run the bundled formatter against any GameMaker project without installing
additional dependencies alongside that project:

1. Install the workspace dependencies once:

   ```bash
   npm install
   ```

2. Format your GameMaker project by passing its directory to the helper script:

   ```bash
   npm run format:gml -- --path "/absolute/path/to/MyGameProject"
   ```

    The path can be absolute or relative to this repository. The script loads Prettier and the plugin from the clone, writes
    formatted output back to the target project, and leaves that project’s `package.json` untouched. The wrapper mirrors the
    CLI behaviour (`--path` or a positional path argument) and logs any skipped non-GML files so you can confirm only `.gml`
    sources were ignored. Supply `--extensions=.gml,.yy` when you want to cover multiple languages at once, or export
    `PRETTIER_PLUGIN_GML_DEFAULT_EXTENSIONS` to reuse the same list on future runs.

### Optional: global install

Prefer a machine-wide setup? Install the packages globally and call `prettier` from anywhere:

```bash
npm install --global --save-exact prettier "antlr4@^4.13.2" "github:SimulatorLife/prettier-plugin-gml#main"
prettier --plugin="$(npm root -g)/root/src/plugin/src/gml.js" --write "**/*.gml"
```

Global installs skip your project `node_modules`, so keep versions in sync to avoid inconsistent formatting. Substitute the
Windows or macOS equivalent of `$(npm root -g)` if your shell does not support command substitution. If the global install fails
with an `ENOTDIR` error mentioning `node_modules/root`, clear any stale `root` entries created by previous attempts and rerun the
command.

### Validate your setup

- Confirm Prettier sees the plugin:

  ```bash
  npx prettier --plugin=./node_modules/root/src/plugin/src/gml.js --support-info | grep gml-parse
  ```

- Lint before committing to catch syntax errors early:

  ```bash
  npx prettier --plugin=./node_modules/root/src/plugin/src/gml.js --check "**/*.gml"
  ```

- Prefer using a workspace wrapper? `npm run format:gml -- --check --path .` runs the same validation through the helper while
  honouring any default extensions you configured.

## Usage tips

### Command line

- Format the current directory with an explicit plugin path:

  ```bash
  npx prettier --plugin=./node_modules/root/src/plugin/src/gml.js --write .
  ```

- Check formatting without writing changes:

  ```bash
  npx prettier --plugin=./node_modules/root/src/plugin/src/gml.js --check "rooms/**/*.gml"
  ```

- Target a single file for quick experiments:

  ```bash
  npx prettier --plugin=./node_modules/root/src/plugin/src/gml.js --write scripts/player_attack.gml
  ```

- Format a whole project with the wrapper helper from any checkout:

  ```bash
  node ./node_modules/root/src/plugin/prettier-wrapper.js --path . --extensions=.gml,.yy
  ```

  The wrapper expands glob patterns, merges plugin paths discovered via `resolveConfig`, and prints a skipped-file summary so
  you can audit what was excluded. See [Format with a local clone](#format-with-a-local-clone) if you prefer to run the helper
  from this repository instead of a project install.

See the [Prettier CLI docs](https://prettier.io/docs/en/cli.html) for more options, and watch the
[GitHub releases](https://github.com/SimulatorLife/prettier-plugin-gml/releases) for plugin updates. Curious about more
formatter-specific tooling? Browse the [documentation index](docs/README.md) for plans and guides on metadata harvesting,
identifier handling, and rename safety nets.

### Legacy `#define` directives

GameMaker Studio 2 rejects `#define` statements, so the formatter automatically normalises them while preserving the
surrounding whitespace:

- Macro-style directives are rewritten as `#macro` declarations so compiled builds remain valid.
- Markers that look like region headers or footers are converted to `#region`/`#endregion`.
- Lines that do not match either pattern are dropped entirely so stray `#define` placeholders cannot break builds.

Add a comment explaining the original intent if you run into a line that the formatter removes—the deleted directive was
never valid GML and GameMaker would have rejected it at compile time.

### Visual Studio Code

1. Install the [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) extension.
2. Install a GML language service (for example [GML Support](https://marketplace.visualstudio.com/items?itemName=electrobrains.gml-support)).
3. Ensure the workspace `package.json` lists the Git dependency so the extension downloads the parser alongside Prettier (for
   example by running `npm install --save-dev prettier antlr4@^4.13.2 github:SimulatorLife/prettier-plugin-gml#main`).
4. Enable format-on-save (either globally or per-workspace):

   ```json
   {
     "editor.formatOnSave": true,
     "[gml]": {
       "editor.defaultFormatter": "esbenp.prettier-vscode"
     }
   }
   ```

Prettier will now automatically reformat `.gml` files whenever you save.

### Configuration reference

The plugin exposes standard Prettier options. Keep overrides scoped to `.gml` files so other languages stay unaffected:

```json
{
  "plugins": ["./node_modules/root/src/plugin/src/gml.js"],
  "overrides": [
    {
      "files": "*.gml",
      "options": {
        "printWidth": 100,
        "tabWidth": 2,
        "semi": true
      }
    }
  ]
}
```

Refer to the [Prettier configuration guide](https://prettier.io/docs/en/configuration.html) for the complete option list, and
check the [documentation index](docs/README.md) for in-depth notes about rename safeguards and identifier casing.

#### Plugin-specific options

- `optimizeLoopLengthHoisting` (default: `true`)

  Hoists supported loop size calls (for example `array_length(...)`, `ds_queue_size(...)`) out of matching `for` loop conditions and stores the result in a cached variable (`var <name>_<suffix> = <size_function>(...);`). Disable the option to keep the original loop structure when this optimization is undesirable for your project.

- `condenseStructAssignments` (default: `true`)

  Merges consecutive property assignments on the same struct into a single struct literal when it is safe to do so. Disable
  the option to keep individual assignment statements instead of collapsing them into `{property: value}` expressions.

- `allowSingleLineIfStatements` (default: `true`)

  Keeps short `if` statements such as `if (condition) { return; }` on a single line. Set the option to `false` if you prefer
  the formatter to always expand the consequent across multiple lines.

- `logicalOperatorsStyle` (default: `"keywords"`)

  Controls how the formatter renders logical conjunction and disjunction operators. The default `"keywords"` style rewrites
  `&&` and `||` using GameMaker's `and`/`or` keywords, matching the plugin's historical behaviour. Switch the option to
  `"symbols"` to preserve the original operators verbatim.

- `condenseLogicalExpressions` (default: `false`)
  Combines adjacent logical expressions using the same operator into a single expression. For example, `((a && b) && c)` becomes `a && b && c`. Set the option to `true` to enable the transformation, or leave it `false` to keep the original expression structure.

- `convertDivisionToMultiplication` (default: `false`)
  Rewrites division by a literal constant into multiplication by its reciprocal when it is safe to do so. For example, `x / 4` becomes `x * 0.25`. Set the option to `true` to enable the transformation, or leave it `false` to keep the original division expressions.

- `useStringInterpolation` (default: `false`)

  Converts string concatenations made up entirely of string literals and simple
  expressions into GameMaker template strings (for example,
  `"Hello, " + name + "!"` becomes `$"Hello, {name}!"`). Leave disabled if you
  prefer to keep concatenation operators or need to support runtimes without
  template string support.

- `gmlIdentifierCase` and scope overrides (default: `off` / `inherit`)

  Enables opt-in identifier renaming across functions, structs, locals,
  instance members, globals, assets, and macros. The base option selects the
  target case style (camel, Pascal, snake lower, or snake upper) and the
  per-scope overrides refine individual domains. Complementary ignore,
  preserve, and acknowledgement flags let you exempt specific names or confirm
  asset renames. Review the [Identifier Case & Naming Convention Guide](docs/naming-conventions.md)
  and the [identifier-case rollout playbook](docs/identifier-case-rollout.md)
  for the full behaviour matrix before enabling automatic renames in large
  projects.

- `preserveGlobalVarStatements` (default: `true`)

  Keeps `globalvar` declarations in the formatted output while still prefixing subsequent assignments with `global.`. Set the
  option to `false` if you prefer to omit the declarations entirely.

- `maxParamsPerLine` (default: `0`)

  Forces function call arguments to wrap once the provided count is exceeded. Set the option to `0` to keep the original
  layout when the formatter does not need to reflow the arguments.

- `loopLengthHoistFunctionSuffixes` (default: empty string)

  Override the suffix that the cached loop variable receives for specific size-retrieval functions, or disable hoisting for a
  function entirely. Provide a comma-separated list of `function_name=suffix` pairs (e.g. `array_length=len,ds_queue_size=count`)
  — `function_name:suffix` also works if you prefer colons. Use `-` in place of a suffix to remove a function from the optimization
  list (e.g. `array_length=-`).

- `alignAssignmentsMinGroupSize` (default: `3`)

  Aligns the `=` operator across consecutive simple assignments once at least this many statements appear back-to-back. Increase
  the value to require larger groups before alignment happens, or set it to `0` to disable the alignment pass entirely.

- `trailingCommentPadding` (default: `2`)

  Controls how many spaces the formatter inserts between code and any trailing end-of-line comments. Raise the value to push
  inline comments further right, or set it to `0` to keep them tight against the preceding code.

- `trailingCommentInlineOffset` (default: `1`)

  Adjusts how many of the trailing comment padding spaces are trimmed when applying inline comment padding. Increase the value
  to keep inline comments closer to the code, or set it to `0` to align inline comments with the full trailing padding.

- `lineCommentBannerMinimumSlashes` (default: `5`)

  Preserve banner-style comments that already have at least this many consecutive `/` characters. Decrease the value if your
  project prefers shorter banners, or raise it to require a longer prefix before a comment is treated as a banner.

- `applyFeatherFixes` (default: `false`)

  Enables opt-in auto-fixes that leverage the bundled GameMaker Feather metadata. When enabled the formatter removes the
  trailing semicolon from `#macro` declarations, satisfying the GM1051 diagnostic in the official Feather catalogue while
  preserving all existing spacing inside the macro body.

- `lineCommentBannerAutofillThreshold` (default: `4`)

  Automatically pad banner comments up to the minimum slash count when they already start with at least this many `/` characters.
  Lower the number to aggressively promote comments to banners, or set it to `0` to disable padding entirely.

- `lineCommentBoilerplateFragments` (default: empty string)

  Extends the built-in list of substrings that identify boilerplate line comments which should be stripped entirely. Provide a
  comma-separated list such as `Generated by ToolX,Do not edit` to remove additional notices when they appear in the trimmed
  comment text.

- `lineCommentCodeDetectionPatterns` (default: empty string)

  Adds custom regular expressions to the commented-out code detector so you can preserve additional inline formats verbatim.
  Supply patterns such as `/^SQL:/i` (comma-separated) to keep specific prefixes from being rewritten with extra spacing.

All plugin options can be configured inline (e.g. via `.prettierrc`, `prettier.config.cjs`, or the `prettier` key inside
`package.json`). Consult the [Prettier configuration guide](https://prettier.io/docs/en/configuration.html) for syntax details.

## Identifier case rollout

The `gmlIdentifierCase` option ships in dry-run mode so you can audit rename
plans before touching source files. The playbook below summarises the workflow;
see [Identifier case rollout playbook](docs/identifier-case-rollout.md) for the
full walkthrough.

### Generate a project index

- The formatter now auto-discovers the closest `.yyp` manifest when formatting a
  file with identifier-case features enabled. The first run builds a
  project-wide index, stores it under
  `.prettier-plugin-gml/project-index-cache.json`, and reuses that cache on
  subsequent invocations.
- Override the discovery directory with `gmlIdentifierCaseProjectRoot`, or set
  `gmlIdentifierCaseDiscoverProject: false` to opt back into manual index
  management. Supplying `identifierCaseProjectIndex` still bypasses the
  bootstrap entirely if you need a pre-generated index for deterministic CI
  runs.
- The [Identifier case rollout playbook](docs/identifier-case-rollout.md)
  expands on the automatic cache lifecycle and shows how to keep manual
  snapshots when you need an audit trail.

### Dry-run locals-first renames

- Copy the [locals-first sample config](docs/examples/identifier-case/locals-first.prettierrc.mjs)
  into your project as `.prettierrc.mjs` (or merge the relevant snippet). It
  enables camelCase conversions for local variables only, keeps other scopes in
  observation mode, and stores reports under `.gml-reports/`.
- Run Prettier with the installed plugin path, for example:

  ```bash
  npx prettier --config ./prettierrc.mjs \
    --plugin=./node_modules/root/src/plugin/src/gml.js \
    --write "scripts/**/*.gml"
  ```

  Dry-run mode leaves sources untouched but prints a summary headed by
  `[gml-identifier-case]` and writes a JSON log similar to
  [docs/examples/identifier-case/dry-run-report.json](docs/examples/identifier-case/dry-run-report.json).
- Share the console summary and JSON log with reviewers so they can validate the
  plan against real usage before approving changes.

### Promote renames to write mode

- After peer review, set `identifierCaseDryRun: false` in your Prettier config
  and re-run the formatter with `--write` to apply the accepted renames.
- Keep the report log path in place—write mode still emits the JSON payload so
  you have an audit trail of applied operations.
- Leave `gmlIdentifierCaseAssets` set to `off` (and omit the acknowledgement
  flag) until the team is ready to audit file-system changes triggered by asset
  renames.

### Migration checklist

- Start new rollouts on feature branches with dry-run mode enabled so gameplay
  logic remains untouched while you iterate on configuration.
- Capture the generated project index and dry-run JSON in the branch to keep the
  rename plan stable across machines and CI agents.
- Schedule a teammate familiar with the affected scripts to review the dry-run
  report before enabling write mode; peer review is the last safety net for
  incorrect suggestions.
- Expand scope gradually (locals → functions → structs → instances → globals →
  macros) and repeat the dry-run + review cycle for each stage.

## Troubleshooting

- Confirm Node and npm meet the version requirements. The workspace requires Node.js 18.18.0+, 20.9.0+, or 21.1.0+.
- If Prettier cannot find the plugin, ensure it appears in your local `package.json` or is installed globally (`npm list -g --depth=0`).
- Remove and reinstall the packages when in doubt:

  ```bash
  npm uninstall prettier antlr4 root
  npm install --save-dev prettier "antlr4@^4.13.2" "github:SimulatorLife/prettier-plugin-gml#main"
  ```

  - Seeing `No parser could be inferred for file ...`? Ensure you installed the plugin from the GameMaker project directory and
    pass the plugin path to the CLI (for example `--plugin=./node_modules/root/src/plugin/src/gml.js`).
  - Wrapper complaining about a missing target? Pass the project directory as the first argument or via `--path=...` (for example
    `node ./node_modules/root/src/plugin/prettier-wrapper.js --path .`).
  - Using `zsh` and seeing `no matches found`? Quote the dependency specifiers: `npm install --save-dev prettier "antlr4@^4.13.2" "github:SimulatorLife/prettier-plugin-gml#main"`.
- Identifier-case dry run not reporting anything? Confirm `gmlIdentifierCase` is set to a case style and that the formatter can
  discover your `.yyp` manifest. Override discovery with `gmlIdentifierCaseProjectRoot`, or supply
  `identifierCaseProjectIndex`/`gmlIdentifierCaseDiscoverProject: false` when you need to manage the index manually.
- Seeing unexpected rename collisions? Review the JSON log for `collision`, `ignored`, or `preserve` entries and adjust
  `gmlIdentifierCaseIgnore` / `gmlIdentifierCasePreserve` before re-running the dry run. The
  [Identifier case rollout playbook](docs/identifier-case-rollout.md#troubleshooting-checklist) lists additional checks.

- Still stuck? [Open an issue](https://github.com/SimulatorLife/prettier-plugin-gml/issues) with reproduction details.

## Architecture overview

| Path | Purpose |
| --- | --- |
| `src/parser/` | ANTLR grammar files, the generated parser, and parser-focused tests that validate new syntax support. |
| `src/plugin/` | The Prettier plugin entry (`src/gml.js`), printer, comment pipeline, CLI wrapper, and plugin-specific tests. |
| `src/shared/` | Cross-cutting utilities reused by the parser and plugin (AST helpers, identifier casing, CLI error handling, line-break logic, and the project index helpers). |
| `resources/` | Generated data files that power formatter heuristics (for example `gml-identifiers.json` and `feather-metadata.json`). |
| `scripts/` | Tooling that regenerates manual-driven metadata and other derived assets exposed via `npm run build:*`. |
| `docs/` | Guides and planning notes. Start with the [documentation index](docs/README.md) for an overview of available references. |

The repository is configured as an npm workspace so the root `node_modules` folder manages dependencies for both the parser and the plugin packages.

## Development

### Repository layout

```
prettier-plugin-gml/
├─ src/parser/   # ANTLR grammar, generated parser, and parser tests
├─ src/plugin/   # Prettier plugin source, printer, CLI wrapper, and plugin tests
├─ src/shared/   # Shared utilities (AST helpers, identifier casing, CLI plumbing)
├─ resources/    # Generated metadata consumed by the formatter
├─ docs/         # Design notes (e.g. reserved identifier harvesting plan)
└─ package.json        # Workspace manifest with scripts and shared tooling
```

See [Architecture overview](#architecture-overview) for more detail about each package.

### Set up the workspace

```bash
git clone https://github.com/SimulatorLife/prettier-plugin-gml.git
cd prettier-plugin-gml
nvm use # optional but recommended; aligns with the .nvmrc version
npm install
```

The workspace definition installs the root tooling plus the parser and plugin package dependencies in a single `npm install` run. This includes the shared [Mocha](https://mochajs.org/) binary so the parser and plugin test suites work out of the box. Use `npm install --workspace src/plugin` or `npm install --workspace src/parser` when you only need to refresh a single package.

The first install also wires up a local [Husky](https://typicode.github.io/husky/) pre-commit hook that runs `npm run format` and `npm run lint:fix` before every commit. Set `HUSKY=0` when you need to bypass the hook (for example, in CI environments that handle formatting separately).

### Test the plugin and parser

Run every test suite from the repository root:

```bash
npm test
```

Run an individual suite when iterating on a component:

```bash
npm run test:plugin
npm run test:parser
npm run test:shared
```

Lint the JavaScript sources before submitting a change:

```bash
npm run lint
```

Enforce a zero-warning policy in CI or pre-push checks:

```bash
npm run lint:ci
```

Need a quick safety check before committing? `npm run format:check` ensures the repository already matches our Prettier
configuration, and `npm run lint:fix` auto-applies straightforward ESLint fixes.

The plugin and parser suites are powered by [Mocha](https://mochajs.org/). Use the workspace-local runner to enable additional
flags such as watch mode or filtering individual tests:

```bash
npm run test --workspace src/plugin -- --watch
npm run test --workspace src/parser -- --watch
npm run test --workspace src/shared -- --watch
```

Fixtures under `src/plugin/tests` capture golden formatter output. Update them only when intentionally changing the emitted
code and include the corresponding rationale in your pull request.

### Regenerate metadata snapshots

The formatter relies on generated metadata stored under `resources/` to make naming, diagnostic, and language-aware decisions.
Refresh the datasets whenever YoYo Games updates the manual or when you tweak the scrapers. The harvesting and cache design notes in the [Identifier Case & Naming Convention Guide](docs/naming-conventions.md#5-reserved-identifier-dataset),
[Project Index Cache Design](docs/project-index-cache-design.md), and
[Feather Data Plan](docs/feather-data-plan.md) describe the scraping pipelines in more detail:

```bash
npm run build:gml-identifiers
npm run build:feather-metadata
```

Both commands accept `--ref <branch|tag|commit>` to target a specific manual revision and `--force-refresh` to bypass the cached
downloads stored in `scripts/cache/manual/`. Use `--progress-bar-width <n>` (or set `GML_PROGRESS_BAR_WIDTH`) to scale the
terminal progress indicator for narrow or wide terminals. Pass `--help` for a full argument list, including custom output
destinations, and consult the linked plans for a deeper explanation of how each dataset is generated and consumed.

### Regenerate the parser grammar

Install [ANTLR 4](https://www.antlr.org/download.html) and Java, then run the generator:

```bash
npm run build:antlr
```

This command re-generates the parser and lexer inside `src/parser/src/generated` based on the `.g4` grammar files. The script
expects the `antlr` CLI in your `PATH`.

### Handy development commands

- Format a fixture with the development version of the plugin:

  ```bash
  npm run example:plugin
  ```

- Audit repository formatting without writing changes:

  ```bash
  npm run format:check
  ```

- Manually invoke the raw Prettier CLI with the local plugin:

  ```bash
  npm --prefix src/plugin run prettier:plugin --path=tests/test14.input.gml
  ```

## Useful VS Code extensions

- [ANTLR4 Grammar Syntax Support](https://marketplace.visualstudio.com/items?itemName=mike-lischke.vscode-antlr4)
- [GML Support](https://marketplace.visualstudio.com/items?itemName=electrobrains.gml-support)
