# Identifier Case Utility Reference

This document records how the shared identifier case helpers normalise and
reconstruct GML identifiers. The module is implemented in
`src/shared/identifier-case.js` and centralises the tokenisation rules that case
transformations rely upon.

## Reserved prefixes

The tokenizer preserves the prefixes below exactly as written. They are stripped
from the identifier before case conversion and reattached verbatim afterwards.

- `global.`
- `other.`
- `self.`
- `local.`
- `with.`
- `noone.`
- `argument` (optionally followed by a numeric index, such as `argument0`)
- `argument_local` (optionally followed by a numeric index)
- `argument_relative` (optionally followed by a numeric index)
- `argument[<number>]` (array-style argument accessors)

When the prefix ends with a dot (for example `global.` or `argument0.`) the dot
is included in the preserved portion.

## Normalisation steps

1. **Prefix detection:** If a reserved prefix is detected it is separated from
   the remainder and stored for later reattachment.
2. **Numeric suffix capture:** A trailing run of digits, optionally prefixed by
   a single underscore (e.g. `_12`), is removed from the working string and kept
   as a numeric suffix so that counters stay attached to the identifier.
3. **Edge underscores:** Leading and trailing underscores are removed from the
   working string and stored so they can be re-applied verbatim in the final
   result. This ensures identifiers like `__hp__` remain unchanged after
   round-tripping.
4. **Tokenisation:** The inner portion is split into tokens by underscores,
   camel-case boundaries, and digit runs. Alphabetic tokens are lowercased for
   consistent downstream handling while numeric tokens retain their original
   digits.

The resulting structure captures:

```js
{
    original: "global.hp_max_2",
    prefix: "global.",
    leadingUnderscores: "",
    trailingUnderscores: "",
    suffixSeparator: "_",
    suffixDigits: "2",
    tokens: [
        { normalized: "hp", type: "word" },
        { normalized: "max", type: "word" }
    ]
}
```

## Case reconstruction

Four reconstruction helpers are exposed:

- `camel`: produces lower camel case (`hpMax`, `pathFinderState`).
- `pascal`: produces Pascal case (`HpMax`, `PathFinderState`).
- `snake-lower`: produces lower snake case (`hp_max`, `path_finder_state`).
- `snake-upper`: produces upper snake case (`HP_MAX`, `PATH_FINDER_STATE`).

During snake case reconstruction, numeric tokens fuse with adjacent alphabetic
segments so counters remain inline (e.g. tokens `hp`, `2`, `d`, `max` become
`hp2d_max`). Camel and Pascal case reconstruction capitalises alphabetic tokens
beyond the first token (or every token for Pascal) while leaving numeric tokens
unchanged. In every case the preserved prefix, leading/trailing underscores, and
numeric suffix are re-applied at the end of the process.

## Idempotence

The `formatIdentifierCase` helper is idempotent. Identifiers that already match
one of the supported case styles will round-trip without modification, which is
verified by the exported `isIdentifierCase` convenience checks used in the test
suite.
