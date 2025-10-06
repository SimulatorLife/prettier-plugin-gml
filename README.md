# Prettier Plugin for GameMaker Language

<p align="center">
  <a href="https://github.com/SimulatorLife/prettier-plugin-gml/issues">
    <img alt="GitHub Issues" src="https://img.shields.io/github/issues/SimulatorLife/prettier-plugin-gml">
  </a>
</p>

A [Prettier](https://prettier.io/) plugin that understands [GameMaker Language](https://manual.gamemaker.io/) (GML) files. The
plugin bundles an ANTLR-powered parser for `.gml` sources so that your scripts, objects, and shaders can share the same
consistent formatting workflow as the rest of your project. It is published on npm as
[`prettier-plugin-gamemaker`](https://www.npmjs.com/package/prettier-plugin-gamemaker).

> ⚠️ The formatter is still experimental. Commit your work or keep backups handy before formatting large projects.

## Table of contents

- [Quick start](#quick-start)
  - [Requirements](#requirements)
  - [Install in a project](#install-in-a-project)
  - [Format your code](#format-your-code)
  - [Optional: global install](#optional-global-install)
- [Usage](#usage)
  - [Command line](#command-line)
  - [Visual Studio Code](#visual-studio-code)
  - [Configuration reference](#configuration-reference)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
  - [Repository layout](#repository-layout)
  - [Set up the workspace](#set-up-the-workspace)
  - [Test the plugin and parser](#test-the-plugin-and-parser)
  - [Regenerate the parser grammar](#regenerate-the-parser-grammar)
  - [Handy development commands](#handy-development-commands)
- [Useful VS Code extensions](#useful-vs-code-extensions)

## Quick start

### Requirements

- Node.js **16.13** or newer (Prettier 3.x requirement). Node 18 LTS or newer is recommended.
- npm (ships with Node.js). Confirm availability with:

  ```bash
  node -v
  npm -v
  ```

### Install in a project

1. Install Prettier and the plugin as development dependencies in your GameMaker project directory:

   ```bash
   npm install --save-dev prettier prettier-plugin-gamemaker
   ```

2. Tell Prettier to load the plugin by creating (or updating) a `.prettierrc` file. Prettier 3 automatically discovers local plugins, but adding an explicit override ensures `.gml` files use the GameMaker parser:

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

   Prettier will now apply the bundled defaults (`tabWidth: 4`, `semi: true`, `trailingComma: "none"`, `printWidth: 120`) when it encounters `.gml`
   files. Adjust these in your config if you need different formatting conventions.

### Format your code

Run Prettier from your project directory once or wire it into your build scripts:

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

Keep in mind that globally installed Prettier will attempt to format every supported file type that you open.

## Usage

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

### Visual Studio Code

1. Install the [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) extension.
2. Install a GML language service (for example [GML Support](https://marketplace.visualstudio.com/items?itemName=electrobrains.gml-support)).
3. Ensure Prettier finds the plugin by adding `prettier-plugin-gamemaker` to your workspace `package.json` (or by using the global installation above).
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

The plugin exposes the standard Prettier options. You can override the defaults by updating your `.prettierrc`:

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

If you maintain separate Prettier settings for other languages, prefer `overrides` to keep `.gml` behaviour isolated.

## Troubleshooting

- Double-check that Node and npm are up to date. Prettier 3 requires at least Node 16.13.
- If Prettier cannot find the plugin, confirm it is listed in either your local `package.json` dependencies or globally installed
  via `npm list -g --depth=0`.
- Remove and reinstall the packages when in doubt:

  ```bash
  npm uninstall prettier prettier-plugin-gamemaker
  npm install --save-dev prettier prettier-plugin-gamemaker
  ```

- Still stuck? [Open an issue](https://github.com/SimulatorLife/prettier-plugin-gml/issues) with reproduction details.

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

### Set up the workspace

```bash
git clone https://github.com/SimulatorLife/prettier-plugin-gml.git
cd prettier-plugin-gml
npm install
npm run install:recursive
```

The recursive install script walks through the repository and installs dependencies for each package (parser and plugin).

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

### Regenerate the parser grammar

Install [ANTLR 4](https://www.antlr.org/download.html) and Java, then execute the helper script:

```bash
npm run antlr
```

This command re-generates the parser and lexer inside `src/parser/src/generated` based on the `.g4` grammar files.

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

