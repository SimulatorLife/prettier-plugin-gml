# Naming Convention Case Reference

This guide standardizes how the Prettier GML plugin converts identifiers when
`gmlIdentifierCase` is configured. It covers the supported case families—camel,
Pascal, snake lower, and snake upper—and describes tokenization, numeric
handling, underscores, and prefix retention rules that apply uniformly across
identifier scopes.

## Tokenization rules

All case conversions rely on a shared tokenizer that splits an identifier into
ordered segments. The tokenizer follows these rules:

- **Letter boundaries:** Lower-to-upper or upper-to-lower transitions mark new
  segments (`hpMax` → `hp` + `Max`). Acronyms are preserved by consuming
  contiguous uppercase runs (`HTTPRequest` → `http` + `request`).
- **Digits:** Numeric runs are treated as independent segments so they remain in
  place across conversions (`hp2DMax` → `hp` + `2` + `d` + `max`).
- **Existing separators:** `_`, `.`, and array-like brackets (`argument[0]`)
  partition the identifier but are preserved verbatim in the final result.
- **Prefixes:** Known prefixes such as `global.`, `other.`, and `argument` or
  `argument[<index>]` are detected before tokenization and copied through
  without modification.
- **Leading/trailing underscores:** Sequences of underscores at either end of an
  identifier are preserved exactly as written.

The tokenizer is idempotent: identifiers that already satisfy the desired case
style will round-trip without change.

## Case styles

### Camel case (`camel`)

- **Shape:** Lower camelCase. The first alpha segment is lowercase, subsequent
  segments are capitalized (`hpMax`, `pathFinderState`).
- **Digits:** Numeric segments stay inline without capitalization changes
  (`hp2DMax` → `hp2DMax`).
- **Underscores:** Internal underscores are removed during conversion unless
  part of a preserved prefix (`_hp_max` → `_hpMax`).
- **Prefixes:** Prefixes such as `global.` or `argument[0]` remain untouched, and
  camel casing is applied only to the trailing identifier
  (`global.hp_max` → `global.hpMax`).

### Pascal case (`pascal`)

- **Shape:** Upper camelCase. Every segment starts with an uppercase letter
  (`HpMax`, `PathFinderState`).
- **Digits:** Numeric segments are unchanged and retain their position
  (`hp2D_max` → `Hp2DMax`).
- **Underscores:** Internal underscores are removed unless they belong to the
  preserved prefix (`__hp_max` → `__HpMax`).
- **Prefixes:** Prefix segments (e.g., `global.`) are preserved verbatim and the
  Pascal conversion applies to the portion after the prefix
  (`global.hp_max` → `global.HpMax`).

### Snake lower (`snake-lower`)

- **Shape:** Lower snake_case. All alphabetic characters become lowercase and
  underscores separate segments (`hp_max`, `path_finder_state`).
- **Digits:** Numeric segments are emitted without additional underscores unless
  they border letters (`hp2DMax` → `hp2d_max`).
- **Underscores:** Existing underscores collapse to single separators between
  tokens. Leading/trailing underscores are preserved exactly.
- **Prefixes:** Prefixes remain untouched, and snake casing is applied to the
  suffix only (`global.hpMax` → `global.hp_max`).

### Snake upper (`snake-upper`)

- **Shape:** Upper snake_case. All alphabetic characters become uppercase, with
  underscores inserted between segments (`HP_MAX`, `PATH_FINDER_STATE`).
- **Digits:** Numeric segments are unchanged except for surrounding underscores
  when adjacent to letters (`hp2DMax` → `HP2D_MAX`).
- **Underscores:** Internal underscores normalize to single separators. Leading
  or trailing underscores remain as written (`__hpMax` → `__HP_MAX`).
- **Prefixes:** Prefixes such as `global.` or `argument[0]` are preserved; only
  the post-prefix suffix is converted (`argument[0].hpMax` →
  `argument[0].HP_MAX`).

## Special considerations

- **Invalid characters:** Case conversion never introduces characters that are
  illegal in GML identifiers. If an input contains unsupported characters, the
  converter must report an error instead of attempting a rewrite.
- **Already formatted names:** Identifiers already matching the target style are
  returned unchanged to avoid noisy diffs.
- **Idempotence with prefixes:** Tokens following prefixes are processed
  independently, ensuring `global.HP_MAX` converted to camel case becomes
  `global.hpMax`, while the `global.` prefix remains untouched.
- **Array accessors:** Index brackets are preserved (`argument[1]` stays
  `argument[1]`), and only the property after the accessor is reformatted
  (`argument[1].hp_max` → `argument[1].hpMax`).

Use this reference during implementation and review to validate tokenizer and
case-conversion behaviours before promoting naming transformations to new
scopes.
