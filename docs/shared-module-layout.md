# Shared module layout refresh

## Pain points observed during the audit

- `src/shared` mixed AST helpers, printer metadata utilities, and low-level
  helpers in a single flat directory. Discoverability suffered because new
  contributors had to scan through unrelated files to find the helpers used by
  a feature area.
- The `*-utils` modules effectively built an unstructured utility surface at the
  top level of the package. Several packages imported multiple helpers from the
  directory, so the proliferation of single-purpose files increased the number
  of long relative paths that each caller had to juggle.

## Target layout and first-step refactor

- Introduce two high-level groupings under `src/shared/`:
  - `src/shared/ast/` collects AST-facing helpers such as the location helpers
    and comment discovery utilities. They now share an `index.js` barrel so
    modules that work with AST metadata can import from one place.
  - `src/shared/utils/` consolidates general-purpose utilities (array, string,
    number, path, JSON, RegExp, etc.) with an accompanying barrel export.
- The original file names at `src/shared/*-utils.js` (and the AST helper entry
  points) remain as thin re-export shims. This keeps every existing import path
  working while the codebase transitions toward the new structure.
- The re-exported barrels make it straightforward to adopt the grouped layout on
  a file-by-file basis. Future patches can update imports to point at
  `src/shared/ast` or `src/shared/utils` without juggling individual module
  names.

## Follow-up ideas

- Update high-traffic modules (printers, parser adapters, CLI tooling) to import
  from the new barrel modules. Once the majority of call sites use the grouped
  paths we can consider removing the transitional re-export shims.
- Revisit the remaining files in `src/shared/` (for example the transitional
  `ast-locations` shim) to decide whether they belong in the `ast` folder or
  merit their own category now that the line break helpers live under
  `src/shared/utils/line-breaks.js`.
