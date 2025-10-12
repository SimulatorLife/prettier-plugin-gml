# Project index cache design

This note outlines the initial direction for the project-index cache that will
back upcoming formatter concurrency features.

## Locating the GameMaker project root

The cache needs to be keyed by the GameMaker project that a formatted file
belongs to.  Prettier exposes the current file path via `options.filepath`, so
we treat it as the starting point for discovery.

1. Normalize the path with `path.resolve` to collapse relative segments and to
   give us a stable anchor that works across invocations.
2. Walk up the directory tree from `dirname(options.filepath)` until either a
   `.yyp` manifest is found or we reach the filesystem root.
3. Treat the first directory that contains a `.yyp` file as the project root.
   GameMaker places exactly one manifest in the root, so the nearest manifest
   matches the user's expectation even when nested project folders exist.
4. Bail out (return `null`) if no manifest is discovered.  This covers
   formatting loose scripts or running Prettier on a subset of files that do not
   belong to a full project checkout.

The lookup uses `fs.promises.readdir` by default but accepts an injected file
system facade so tests and callers with virtual file systems can reuse the
logic.

## Cache key shape and modification times

Cache entries must be invalidated when any project metadata that influences the
formatter changes.  The key therefore includes the following components:

- The formatter build identifier (for now a version string passed in by the
  caller).
- The canonical project root path detected by the heuristic above.
- A stable digest that captures the modification times (`mtimeMs`) for the
  `.yyp` manifest and the formatted source file.

To keep the implementation deterministic we sort manifest names and stringify
all numeric values before mixing them into a SHA-256 digest.  Any time either
file changes on disk, its `mtimeMs` shifts, producing a new hash and therefore a
new cache entry.  This keeps cache coordination simple while still allowing the
system to reuse work across parallel Prettier runs when nothing relevant has
changed.
