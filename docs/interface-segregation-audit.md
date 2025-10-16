# Interface Segregation Audit

Date: 2024-11-23

## Objective

Survey the repository for TypeScript or JavaScript interface/type contracts whose broad, catch-all names (for example `*Service`, `*Manager`, `*Controller`, or `*Facade`) signal that they may be accumulating unrelated responsibilities. Refactor one over-sized contract so each consumer depends on the smallest practical surface area.

## Method

The audit began with a repository-wide search to catalogue every definition that looked like a traditional interface or a structural type documented via JSDoc:

- `rg "interface" src`
- `rg "@typedef {object}" src`
- `rg "type" src`

To find likely violations we also enumerated names commonly associated with large coordination abstractions:

- `rg "Service"`
- `rg "Manager"`
- `rg "Controller"`
- `rg "Facade"`

The `Facade` search surfaced `src/plugin/src/project-index/fs-facade.js`, whose exports were inspected alongside the modules that consume them (notably `fs-utils.js`, `cache.js`, and `index.js`).

## Findings

- The majority of modules expose focused functions or small utility objects.
- `src/plugin/src/project-index/fs-facade.js` exports a `ProjectIndexFsFacade` object that attempts to represent the entire file-system surface required by the project index feature. The contract provided directory enumeration, metadata lookups, file reads, writes, renames, directory creation, and deletion primitives in a single shape. This catch-all facade was threaded through the project index coordinator, cache, and bootstrapper. Any caller needing *only* read operations was forced to accept the broader write interface, encouraging optional chaining guards and making test doubles more complicated than necessary.

## Refactor

The facade has been split into smaller, role-focused contracts documented in `src/plugin/src/project-index/fs-facade.js`:

- `ProjectIndexDirectoryReader` – exposes just `readDir`.
- `ProjectIndexFileStatReader` – exposes just `stat`.
- `ProjectIndexFileReader` – exposes just `readFile`.
- `ProjectIndexCacheWriter` – exposes the mutation surface (`mkdir`, `writeFile`, `rename`, `unlink`).

Existing helpers were updated to consume only the capabilities they require:

- `fs-utils.js` accepts directory and stat readers for its helpers.
- `cache.js` limits cache load/save to file readers and cache writers.
- `index.js` composes read-only facades for scanning and parsing while keeping mutation operations confined to cache persistence.

The legacy combined facade (`ProjectIndexFsFacade`) remains for compatibility, but new code should depend on the granular contracts to reduce coupling.

## Outstanding Work

`npm run test:plugin` currently fails with empty formatter outputs and comment attachment errors inherited from the baseline environment. The failures appear unrelated to the facade refactor and require separate investigation into the test fixtures or runtime configuration.

Follow-up suggestions:

1. Add integration coverage exercising `buildProjectIndex` and cache load/save with custom facades that intentionally omit write operations.
2. Verify `findProjectRoot` works correctly with directory-only facades once the formatter regression is resolved.
