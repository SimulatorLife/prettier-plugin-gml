# Doc comment type normalization hook

## Pre-change analysis
- **Current behavior:** `normalizeDocCommentTypeAnnotations` relies on hard-coded
  maps that normalize common GameMaker type names and resource prefixes. Host
  integrations that want to recognize additional synonyms (for example, custom
  typedefs exported by tools) or promote new resource prefixes must fork the
  formatter because the lookups are closed over module-level Maps.
- **Proposed seam:** Introduce a resolver hook that produces the type
  normalization tables. Callers can extend the synonym list, register extra
  resource prefixes, or canonicalize new prefixes while keeping the existing
  heuristics intact. Guardrails ensure inputs are trimmed, lowercased, and
  merged with the opinionated defaults so accidental omissions never strip the
  built-in behavior.
- **Default preservation:** When no resolver is registered the formatter keeps
  using the frozen defaults. Any malformed resolver output is ignored on a
  per-entry basis, and a `restore…` helper returns immediately to today's
  behavior, so the default formatting is unchanged out of the box.

## Overview
`setDocCommentTypeNormalizationResolver` installs a function that returns a
normalization descriptor shaped like:

```js
{
  synonyms: Iterable<[alias, canonicalType]>,
  canonicalSpecifierNames: Iterable<[prefix, canonicalPrefix]>,
  specifierPrefixes: Iterable<string>
}
```

Each collection is optional; absent sections fall back to
`DEFAULT_DOC_COMMENT_TYPE_NORMALIZATION`. The resolver runs when the hook is
registered and whenever `resolveDocCommentTypeNormalization` is invoked, making
it easy for advanced hosts (custom CLIs, editor integrations, etc.) to layer in
project-specific metadata without exposing extra end-user settings.

Helper exports:

- `DEFAULT_DOC_COMMENT_TYPE_NORMALIZATION` — frozen arrays describing the
  built-in tables for easy inspection or cloning.
- `setDocCommentTypeNormalizationResolver(resolver)` — registers the resolver
  and immediately applies it.
- `resolveDocCommentTypeNormalization(options?)` — recomputes the active tables
  using the resolver (if present) and returns the read-only lookup helpers.
- `restoreDefaultDocCommentTypeNormalizationResolver()` — clears the resolver
  and reinstates the defaults.

## Usage example
```js
import {
  DEFAULT_DOC_COMMENT_TYPE_NORMALIZATION,
  resolveDocCommentTypeNormalization,
  setDocCommentTypeNormalizationResolver
} from "prettier-plugin-gml/src/comments/index.js";

setDocCommentTypeNormalizationResolver(() => ({
  synonyms: [["guid", "string"], ["vec3", "vector3"]],
  canonicalSpecifierNames: [["resource", "Resource"]],
  specifierPrefixes: ["resource"]
}));

// Optional: inspect the active tables after installation.
const tables = resolveDocCommentTypeNormalization();
console.log(tables.getCanonicalSpecifierName("resource")); // "Resource"
```

## Future evolution
Today the resolver merges simple string tables. We can extend the descriptor to
carry richer metadata (for example, documentation about custom types) or accept
async lookups while retaining the same guardrails. Additional consumers, such as
language servers or documentation generators, can share the hook to keep their
normalization rules aligned with the formatter.
