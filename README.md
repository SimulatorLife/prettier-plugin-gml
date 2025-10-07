# Prettier Plugin for GameMaker Language

<p align="center">
  <a href="https://github.com/SimulatorLife/prettier-plugin-gml/issues">
    <img alt="GitHub Issues" src="https://img.shields.io/github/issues/SimulatorLife/prettier-plugin-gml">
  </a>
</p>

A [Prettier](https://prettier.io/) plugin that understands [GameMaker Language](https://manual.gamemaker.io/) (GML) files. This
repository houses the parser, printer, and shared helpers in one workspace so scripts, objects, and shaders all benefit from the
same formatter. The plugin is published on npm as
[`prettier-plugin-gamemaker`](https://www.npmjs.com/package/prettier-plugin-gamemaker).

> ⚠️ The formatter is still experimental. Commit your work or keep backups handy before formatting large projects.

## Table of contents

- [Quick start](#quick-start)
  - [Requirements](#requirements)
  - [Install](#install)
  - [Format code](#format-code)
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
  - [Regenerate the parser grammar](#regenerate-the-parser-grammar)
  - [Handy development commands](#handy-development-commands)
- [Useful VS Code extensions](#useful-vs-code-extensions)

## Quick start

### Requirements

- Node.js **14.21.3** or newer (required by Prettier 3). Node 18 LTS or newer keeps pace with current releases.
- npm (ships with Node.js). Confirm availability with:

  ```bash
  node -v
  npm -v
  ```

### Install

1. Add Prettier and the plugin to your GameMaker project:

   ```bash
   npm install --save-dev prettier prettier-plugin-gamemaker
   ```

2. Prettier 3 automatically loads local plugins. Add an explicit override if you want to pin `.gml` files to the bundled
   parser or customise options per language:

   ```json
   {
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
   `optimizeArrayLengthLoops`. Override these values in your configuration to match your team conventions.

3. Keep the package up to date alongside Prettier:

   ```bash
   npm outdated prettier prettier-plugin-gamemaker
   npm update prettier prettier-plugin-gamemaker
   ```

   Re-running `npm install` after a GameMaker update helps ensure the parser matches the latest language features.

### Format code

Run Prettier from your project directory or wire it into your build scripts:

```bash
npx prettier --write "**/*.gml"
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

### Optional: global install

Prefer a machine-wide setup? Install the packages globally and call `prettier` from anywhere:

```bash
npm install --global --save-exact prettier prettier-plugin-gamemaker
prettier --write "**/*.gml" --plugin=prettier-plugin-gamemaker
```

Global installs skip your project `node_modules`, so keep versions in sync to avoid inconsistent formatting.

### Validate your setup

- Confirm Prettier sees the plugin:

  ```bash
  npx prettier --support-info | grep gml-parse
  ```

- Lint before committing to catch syntax errors early:

  ```bash
  npx prettier --check "**/*.gml"
  ```

## Usage tips

### Command line

- Format the current directory (auto-discovers the plugin):

  ```bash
  npx prettier --write .
  ```

- Check formatting without writing changes:

  ```bash
  npx prettier --check "rooms/**/*.gml"
  ```

- Target a single file for quick experiments:

  ```bash
  npx prettier --write scripts/player_attack.gml
  ```

See the [Prettier CLI docs](https://prettier.io/docs/en/cli.html) for more options, and the
[npm package page](https://www.npmjs.com/package/prettier-plugin-gamemaker) for release notes.

### Visual Studio Code

1. Install the [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) extension.
2. Install a GML language service (for example [GML Support](https://marketplace.visualstudio.com/items?itemName=electrobrains.gml-support)).
3. Ensure the workspace `package.json` lists `prettier-plugin-gamemaker` so the extension downloads the parser alongside Prettier.
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

Refer to the [Prettier configuration guide](https://prettier.io/docs/en/configuration.html) for the complete option list. See
[`TASKS.md`](./TASKS.md) for open formatter improvements you can help with.

#### Plugin-specific options

- `optimizeArrayLengthLoops` (default: `true`)

  Hoists calls to `array_length(...)` out of matching `for` loop conditions and stores the result in a cached variable
  (`var <array>_len = array_length(<array>);`). Disable the option to keep the original loop structure when this optimization
  is undesirable for your project.

## Troubleshooting

- Confirm Node and npm meet the version requirements. Prettier 3 needs at least Node 14.21.3.
- If Prettier cannot find the plugin, ensure it appears in your local `package.json` or is installed globally (`npm list -g --depth=0`).
- Remove and reinstall the packages when in doubt:

  ```bash
  npm uninstall prettier prettier-plugin-gamemaker
  npm install --save-dev prettier prettier-plugin-gamemaker
  ```

- Still stuck? [Open an issue](https://github.com/SimulatorLife/prettier-plugin-gml/issues) with reproduction details.

## Architecture overview

- `src/parser/` — ANTLR grammar files, generated parser, and parser tests.
- `src/plugin/` — Prettier plugin entry (`src/gml.js`), printer, comment handling, and plugin-specific tests.
- `src/shared/` — Utilities shared between the parser and plugin (currently newline counting helpers).

Helper scripts in the repository root (`recursive-install.mjs`, `set-config-values.mjs`) allow you to run package commands from
a single terminal session and keep the parser and plugin packages in sync.

## Development

### Repository layout

```
prettier-plugin-gml/
├─ src/parser/   # ANTLR grammar, generated parser, and parser tests
├─ src/plugin/   # Prettier plugin source, printer, and plugin tests
├─ src/shared/   # Helpers shared between the parser and the plugin
├─ recursive-install.mjs  # Helper to install nested package dependencies
└─ set-config-values.mjs  # Utility that shares path configuration between scripts
```

See [Architecture overview](#architecture-overview) for more detail about each package and the helper scripts.

### Set up the workspace

```bash
git clone https://github.com/SimulatorLife/prettier-plugin-gml.git
cd prettier-plugin-gml
npm install
npm run install:recursive
```

The recursive install script walks through the repository and installs dependencies for each package (parser and plugin). Use
`npm --prefix src/plugin install` or `npm --prefix src/parser install` when you only need to refresh a single package.

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

The plugin and parser suites are powered by [Mocha](https://mochajs.org/). Use the workspace-local runner to enable additional
flags such as watch mode or filtering individual tests:

```bash
npm --prefix src/plugin run test -- --watch
npm --prefix src/parser run test -- --watch
```

Fixtures under `src/plugin/tests` capture golden formatter output. Update them only when intentionally changing the emitted
code and include the corresponding rationale in your pull request.

### Regenerate the parser grammar

Install [ANTLR 4](https://www.antlr.org/download.html) and Java, then execute the helper script:

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

