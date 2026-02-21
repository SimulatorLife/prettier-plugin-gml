## TODO: Normalize `#define` → `#macro`

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

## Workspace: Prettier-Plugin / Formatter (`@gml-modules/plugin`)

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

**Responsibility:** Enforce supported directive spelling and provide the targeted text replacement.

**Rule:** `no-define-directive`

**Trigger when:**
- `node.type === "MacroDirective"`
- `node.keyword === "define"`

**Autofix:**
Replace only the directive token using the recorded `keywordRange`.

```ts
fixer.replaceTextRange(
  [node.keywordRange.start, node.keywordRange.end],
  "#macro"
);
```

**Important:**
- Do NOT reprint/replace the entire directive text.
- Only replace the keyword portion so strings/comments/spacing remain intact.

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
- [ ] Implement `no-define-directive`
- [ ] Autofix uses only `keywordRange` → `#macro`

### Tests
- [ ] `#define ...` parses into `MacroDirective(keyword="define")`
- [ ] Printer output matches chosen policy
- [ ] Lint autofix edits only the directive token