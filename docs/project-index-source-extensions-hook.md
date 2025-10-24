# Project index source extension hook

## Pre-change analysis
- **Survey summary.** The formatter, parser, CLI utilities, and project indexer
  all treat GameMaker source files as `*.gml`. The project index
  categorisation step hard-coded this assumption inside
  `resolveProjectFileCategory`, which only matched `.gml` while everything else
  was routed to metadata or ignored.
- **Extensibility gap.** Teams experimenting with generated gameplay code or
  domain specific tooling sometimes checkpoint GML fragments under bespoke file
  extensions (for example `*.npc.gml` or `*.gmlx`). The indexer could not see
  those files, so identifier analysis and formatter-powered refactors skipped
  them entirely.
- **Extension seam.** Introduce a narrow hook that lets internal tooling supply
  additional source extensions via
  `setProjectIndexSourceExtensions([...])`. The helper keeps the builtin `.gml`
  entry and validates input, so callers only add to the recognised surface.
- **Default preservation.** When no hook is used the behaviour is identical to
  today: only `.gml` files are classified as GML source. The reset helper lets
  tests and consumers restore that baseline.

## Configuring additional source extensions

```js
import {
    getProjectIndexSourceExtensions,
    setProjectIndexSourceExtensions,
    resetProjectIndexSourceExtensions
} from "prettier-plugin-gml/project-index";

// Extend the recognised list. `.gml` stays registered automatically.
setProjectIndexSourceExtensions([".gmlx", "generated"]);

// Later, inspect or restore the defaults when the experiment concludes.
getProjectIndexSourceExtensions(); // => [".gml", ".gmlx", ".generated"]
resetProjectIndexSourceExtensions(); // back to [".gml"]
```

- **Default behaviour.** `.gml` is always included and the returned array is
  frozen to guard against accidental mutation.
- **Validation.** The hook only accepts arrays of non-empty strings. Entries are
  trimmed, lower-cased, and normalised to start with a leading `.`.

## Intended consumers
This hook targets integrators embedding the project indexer inside custom
pipelines (for example, in-editor tooling that writes generated behaviour files
alongside hand-authored code). End users formatting projects purely within the
GameMaker IDE do not need it.

## Future evolution
Today the hook extends the recognised source-file suffixes. If additional file
categories ever need customisation (for example new metadata manifests) we can
follow the same opt-in pattern so the defaults remain opinionated while still
being adaptable for power users.
