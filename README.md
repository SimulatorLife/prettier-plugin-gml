# Prettier Plugin for GameMaker Language

<p align="center">
  <a href="https://github.com/SimulatorLife/prettier-plugin-gml/issues">
    <img alt="GitHub Issues" src="https://img.shields.io/github/issues/SimulatorLife/prettier-plugin-gml">
  </a>
</p>

A [Prettier](https://prettier.io/) plugin that understands [GameMaker Language](https://manual.gamemaker.io/) (GML) files. This
repository houses the parser, printer, generated metadata, and shared helpers in one npm workspace so scripts, objects, and shaders
all benefit from the same formatter. The plugin is not yet published on npm; install it straight from GitHub using the
instructions below. The formatter package (`prettier-plugin-gamemaker`) currently ships as part of this workspace, so Prettier
needs an explicit path to load it when you install from Git.

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

### Requirements

- Node.js **18.18.0** or newer (20.9.0+ recommended to track the latest LTS). Use the bundled `.nvmrc` when you want to align
  with the repository’s expected runtime:

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

2. Add Prettier, the plugin, and the parser runtime to your GameMaker project:

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

3. Because the package is installed directly from GitHub, Prettier cannot auto-detect it. Add a convenience script to your
   `package.json` so you consistently point Prettier at the bundled plugin entry (`node_modules/root/src/plugin/src/gml.js`):

   ```jsonc
   {
     "scripts": {
       "format:gml": "prettier --plugin=./node_modules/root/src/plugin/src/gml.js --write \"**/*.gml\""
     }
   }
   ```

   Add an explicit override if you want to pin `.gml` files to the bundled parser or customise options per language. Including
   the plugin path in your Prettier configuration keeps editor integrations working even when the CLI script is not used:

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

   The plugin defaults to `tabWidth: 4`, `semi: true`, `trailingComma: "none"`, `printWidth: 120`, and enables
   `optimizeArrayLengthLoops`. Override these values in your configuration to match your team conventions. Prefer a single entry
   point? Use the bundled wrapper instead of wiring Prettier manually:

   ```bash
   node ./node_modules/root/src/plugin/prettier-wrapper.js --path .
   ```

   The wrapper mirrors the CLI behaviour, automatically reuses your project’s `.prettierrc` overrides, and formats every file
   matching the configured extensions (defaulting to `.gml`). Pass `--extensions=.gml,.yy` to format additional file types in a
   single run.

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

Before | After
------ | -----
```gml
var enemy = argument0; var damage = argument1

with(enemy)
{
          self.hp-=damage
        if(self.hp<=0){instance_destroy(self)}
}
``` | ```gml
var enemy = argument0;
var damage = argument1;

with (enemy) {
    self.hp -= damage;
    if (self.hp <= 0) {
        instance_destroy(self);
    }
}
```

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
    sources were ignored.

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

See the [Prettier CLI docs](https://prettier.io/docs/en/cli.html) for more options, and watch the
[GitHub releases](https://github.com/SimulatorLife/prettier-plugin-gml/releases) for plugin updates.

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

Refer to the [Prettier configuration guide](https://prettier.io/docs/en/configuration.html) for the complete option list.

#### Plugin-specific options

- `optimizeArrayLengthLoops` (default: `true`)

  Hoists calls to `array_length(...)` out of matching `for` loop conditions and stores the result in a cached variable
  (`var <array>_len = array_length(<array>);`). Disable the option to keep the original loop structure when this optimization
  is undesirable for your project.

- `condenseStructAssignments` (default: `true`)

  Merges consecutive property assignments on the same struct into a single struct literal when it is safe to do so. Disable
  the option to keep individual assignment statements instead of collapsing them into `{property: value}` expressions.

- `allowSingleLineIfStatements` (default: `true`)

  Keeps short `if` statements such as `if (condition) { return; }` on a single line. Set the option to `false` if you prefer
  the formatter to always expand the consequent across multiple lines.

- `preserveGlobalVarStatements` (default: `true`)

  Keeps `globalvar` declarations in the formatted output while still prefixing subsequent assignments with `global.`. Set the
  option to `false` if you prefer to omit the declarations entirely.

- `maxParamsPerLine` (default: `0`)

  Forces function call arguments to wrap once the provided count is exceeded. Set the option to `0` to keep the original
  layout when the formatter does not need to reflow the arguments.

- `arrayLengthHoistFunctionSuffixes` (default: empty string)

  Override the suffix that the cached loop variable receives for specific size-retrieval functions, or disable hoisting for a
  function entirely. Provide a comma-separated list of `function_name=suffix` pairs (e.g. `array_length=len,ds_queue_size=count`)
  — `function_name:suffix` also works if you prefer colons. Use `-` in place of a suffix to remove a function from the optimization
  list (e.g. `array_length=-`).

- `alignAssignmentsMinGroupSize` (default: `3`)

  Aligns the `=` operator across consecutive simple assignments once at least this many statements appear back-to-back. Increase
  the value to require larger groups before alignment happens, or set it to `0` to disable the alignment pass entirely.

- `enumTrailingCommentPadding` (default: `2`)

  Controls how many spaces appear between the longest enum member name and any trailing end-of-line comments. Raise the value to
  push comments further right, or set it to `0` to keep comments close to the member names.

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

All plugin options can be configured inline (e.g. via `.prettierrc`, `prettier.config.cjs`, or the `prettier` key inside
`package.json`). Consult the [Prettier configuration guide](https://prettier.io/docs/en/configuration.html) for syntax details.

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
- Using `zsh` and seeing `no matches found`? Quote the dependency specifiers: `npm install --save-dev prettier "antlr4@^4.13.2" "github:SimulatorLife/prettier-plugin-gml#main"`.

- Still stuck? [Open an issue](https://github.com/SimulatorLife/prettier-plugin-gml/issues) with reproduction details.

## Architecture overview

- `src/parser/` — ANTLR grammar files, generated parser, and parser tests.
- `src/plugin/` — Prettier plugin entry (`src/gml.js`), printer, comment handling, the CLI wrapper, and plugin-specific tests.
- `src/shared/` — Utilities shared between the parser and plugin (currently newline counting helpers).
- `resources/` — Generated data files that power formatter heuristics (for example `gml-identifiers.json` and
  `feather-metadata.json`).
- `scripts/` — Tooling that regenerates manual-driven metadata (for example the scrapers behind `npm run build:*`).
- `docs/` — Planning and reference notes such as the [reserved identifier harvesting plan](docs/reserved-identifiers-plan.md)
  and the [Feather metadata ingestion plan](docs/feather-data-plan.md).

The repository is configured as an npm workspace so the root `node_modules` folder manages dependencies for both the parser and the plugin packages.

## Development

### Repository layout

```
prettier-plugin-gml/
├─ src/parser/   # ANTLR grammar, generated parser, and parser tests
├─ src/plugin/   # Prettier plugin source, printer, CLI wrapper, and plugin tests
├─ src/shared/   # Helpers shared between the parser and the plugin
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

### Test the plugin and parser

Run every test suite from the repository root:

```bash
npm test
```

Run an individual suite when iterating on a component:

```bash
npm run test:plugin
npm run test:parser
```

Lint the JavaScript sources before submitting a change:

```bash
npm run lint
```

Auto-fix lint violations when appropriate:

```bash
npm run lint:fix
```

The plugin and parser suites are powered by [Mocha](https://mochajs.org/). Use the workspace-local runner to enable additional
flags such as watch mode or filtering individual tests:

```bash
npm run test --workspace src/plugin -- --watch
npm run test --workspace src/parser -- --watch
```

Fixtures under `src/plugin/tests` capture golden formatter output. Update them only when intentionally changing the emitted
code and include the corresponding rationale in your pull request.

### Regenerate metadata snapshots

The formatter relies on generated metadata stored under `resources/` to make naming, diagnostic, and language-aware decisions.
Refresh the datasets whenever YoYo Games updates the manual or when you tweak the scrapers. The plans in
[docs/reserved-identifiers-plan.md](docs/reserved-identifiers-plan.md) and
[docs/feather-data-plan.md](docs/feather-data-plan.md) describe the scraping pipelines in more detail:

```bash
npm run build:gml-identifiers
npm run build:feather-metadata
```

Both commands accept `--ref <branch|tag|commit>` to target a specific manual revision and `--force-refresh` to bypass the cached
downloads stored in `scripts/cache/manual/`.

### Regenerate the parser grammar

Install [ANTLR 4](https://www.antlr.org/download.html) and Java, then run the generator:

```bash
npm run antlr
```

This command re-generates the parser and lexer inside `src/parser/src/generated` based on the `.g4` grammar files. The script
expects the `antlr` CLI in your `PATH`.

### Handy development commands

- Format a fixture with the development version of the plugin:

  ```bash
  npm run example:plugin
  ```

- Manually invoke the raw Prettier CLI with the local plugin:

  ```bash
  npm --prefix src/plugin run prettier:plugin --path=tests/test14.input.gml
  ```

## Useful VS Code extensions

- [ANTLR4 Grammar Syntax Support](https://marketplace.visualstudio.com/items?itemName=mike-lischke.vscode-antlr4)
- [GML Support](https://marketplace.visualstudio.com/items?itemName=electrobrains.gml-support)

