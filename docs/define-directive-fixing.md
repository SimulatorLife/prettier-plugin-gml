## Directive normalization status

### Goal

Allow legacy/invalid directive:

```gml
#define MY_MACRO "Hello"
```

…but treat it as a macro internally and provide an autofix to produce:

```gml
#macro MY_MACRO "Hello"
```

---

## Workspace: Parser (`@gml-modules/parser`)

**Responsibility:** During AST production, the parser should accept both spellings and emit a single normalized node so downstream tooling never special-cases `#define`.

**Must:**
- Parse `#macro` and `#define` into the same node type (e.g. `MacroDirective`)
- Normalize meaning to “macro”
- Preserve original spelling for diagnostics/fixes
- Record a precise range for the directive token for surgical edits

```ts
type MacroDirectiveNode = {
  type: "MacroDirective";

  // normalized meaning
  directive: "macro";

  // original keyword from source
  keyword: "macro" | "define";

  name: IdentifierNode;
  value: ExpressionNode;

  // full node range in original text
  range: { start: number; end: number };

  // range covering only "#macro" / "#define"
  keywordRange: { start: number; end: number };
};
```

**Notes:**
- Do NOT create `DefineDirective` as a separate node type.
- `keywordRange` should include the leading `#` and the word.

---

## Workspace: Prettier Formatter (`@gml-modules/format`)

**Responsibility:** Print `MacroDirective` reliably, regardless of whether the source used `#define` or `#macro`.

**Must:**
- Treat `MacroDirective` as a macro directive node (no legacy handling)
- Print using one of these policies:

**Policy A (non-semantic formatting):** preserve original spelling  
- Output `#define ...` when `node.keyword === "define"`

**Policy B (normalizing formatter, recommended):** always print `#macro`  
- Output `#macro ...` for both spellings

**Important:** The formatter should never need to know “GML doesn’t support `#define`”; it just prints the node.

---

## Workspace: Linter (`@gml-modules/lint`)

**Responsibility:** Apply tolerant single-file source rewrites for legacy directive spellings and legacy block keywords before formatter-owned layout work.

**Rule:** `normalize-directives`

**Current behavior:**
- rewrites valid `#define NAME ...` directives to `#macro NAME ...`
- rewrites `#define region ...` / `#define end region ...` to `#region` / `#endregion`
- uncomments legacy `//#region` / `//#endregion` lines
- rewrites legacy `begin` / `end` block keywords to `{` / `}`
- preserves invalid `#define` spellings verbatim instead of guessing or commenting them out

**Important:**
- The rule is intentionally tolerant and line-oriented so it can run during Phase A safe-fix processing.
- Canonical `#macro` declarations are left unchanged; formatter-owned spacing is not normalized here.

---

## Checklist

### Parser
- [ ] Parse both `#macro` and `#define` into `MacroDirective`
- [ ] Set `directive: "macro"` for both
- [ ] Preserve `keyword: "macro" | "define"`
- [ ] Record `keywordRange` precisely

### Formatter
- [ ] Print `MacroDirective` as a macro directive
- [ ] Choose policy A (preserve) or B (normalize to `#macro`)

### Linter
- [x] Implement `normalize-directives`
- [x] Rewrite valid legacy directive spellings and legacy block keywords during lint safe-fix passes

### Tests
- [ ] `#define ...` parses into `MacroDirective(keyword="define")`
- [ ] Printer output matches chosen policy
- [x] Lint covers valid `#define` macros, region directives, and legacy `begin` / `end` rewrites
