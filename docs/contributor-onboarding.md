# Contributor onboarding

Use this checklist the first time you contribute to the repository or whenever
you need to refresh a workstation. It complements the Quick start guidance in
[the root README](../README.md#quick-start) with contributor-focused sanity
checks.

## 1. Confirm prerequisites

1. Install **Node.js 25.0.0 or newer**. The workspace ships an `.nvmrc`; run
   `nvm install` followed by `nvm use` so local tooling matches CI.
2. Ensure npm is available (bundled with Node.js). Confirm versions via
   `node -v` and `npm -v`.
3. Optional but recommended: install [Husky](https://typicode.github.io/husky/)
   Git hooks by keeping `HUSKY` unset. Set `HUSKY=0` when you need to bypass the
   hooks (for example, in ad-hoc CI jobs).

## 2. Install dependencies

```bash
nvm use
npm ci
```

`npm ci` installs the exact dependency graph captured in `package-lock.json`.
Use `npm install` only after verifying the lockfile is current.

## 3. Validate the workspace

Run the aggregated checks before opening a pull request:

```bash
npm run check
```

`npm run check` runs the formatter audit, CI-mode lint, and the full Node.js test
suite. Re-run targeted suites when you touch scoped areas:

```bash
npm run test:parser
npm run test:plugin
npm run test:semantic
npm run test:cli
npm run lint
npm run format:check
```

Fixtures under `src/plugin/tests/` and `src/parser/tests/input/` are golden—do
not edit them unless you are intentionally changing formatter or parser output.

## 4. Sanity-check the formatter

Use these commands to verify the formatter wiring before experimenting on a
GameMaker project:

```bash
npm run format:gml -- --help
npm run format:gml -- --check
npm run cli -- --help
```

The first command confirms which plugin entry point the wrapper resolves and
lists accepted flags. Pair it with the [CLI wrapper reference](../README.md#cli-wrapper-environment-knobs)
when scripting automation.

When you're ready to try the wrapper against a project, provide the target
directory explicitly so the command has GameMaker sources to process:

```bash
npm run format:gml -- path/to/project
```

## 5. Explore supporting documentation

* Start with the [documentation index](README.md) for deep dives and planning
  notes.
* Review the [semantic subsystem reference](../src/semantic/README.md) before
  adjusting identifier-case discovery or project-index caching.
* Keep the [identifier-case rollout playbook](identifier-case-rollout.md) handy
  when enabling renames in a project.

Check back with this document whenever you swap machines or return from a long
break to stay aligned with the latest workflow expectations.
