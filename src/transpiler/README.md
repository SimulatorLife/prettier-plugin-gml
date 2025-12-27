# GML Transpiler Module

This package implements the GML → JavaScript transpiler for the prettier-plugin-gml project. The transpiler converts GML source code into JavaScript that can be executed in the runtime wrapper for hot-reload functionality.

## Architecture

The transpiler consists of two main components:

### GmlTranspiler

The main transpiler class that orchestrates the transpilation process:

```javascript
import { createTranspiler } from "gamemaker-language-transpiler";

const transpiler = createTranspiler();

// Transpile a GML script to a patch object
const patch = await transpiler.transpileScript({
    sourceText: "x = 1 + 2",
    symbolId: "gml/script/my_script"
});

// Result:
// {
//   kind: "script",
//   id: "gml/script/my_script",
//   js_body: "x = (1 + 2);",
//   sourceText: "x = 1 + 2",
//   version: 1730702400000
// }
```

### GmlEmitter

The code emitter that walks the GML AST and generates JavaScript:

```javascript
import { emitJavaScript } from "gamemaker-language-transpiler/src/emitter.js";

const ast = parser.parse();
const jsCode = emitJavaScript(ast);
```

## Features

### Current Implementation

- ✅ Number, string, and boolean literals
- ✅ Identifiers
- ✅ Binary expressions (+, -, *, /, etc.)
- ✅ GML operator mapping (div → /, mod → %, and → &&, or → ||, etc.)
- ✅ Strict equality conversion (== → ===, != → !==)
- ✅ Assignment expressions
- ✅ Basic statements
- ✅ Array indexing (arr[0], matrix[i][j])
- ✅ Property access (obj.prop, nested.property.access)
- ✅ Function calls (func(), func(arg1, arg2))
- ✅ Variable declarations (var x = 10, y = 20)
- ✅ Function declarations (function myFunc(a, b) { ... })
- ✅ Control flow statements:
  - ✅ if/else statements (including else-if chains)
  - ✅ for loops
  - ✅ while loops
  - ✅ do-until loops (converted to do-while with negated condition)
  - ✅ switch statements with case and default
- ✅ Loop control:
  - ✅ break statements
  - ✅ continue statements
- ✅ repeat loops (converted to for loops with countdown)
- ✅ return statements (with and without values)
- ✅ Parenthesized expressions
- ✅ Block statements
- ✅ Nested control flow structures
- ✅ Array literals ([1, 2, 3])
- ✅ Struct literals ({a: 1, b: 2}) mapped to JavaScript object literals
- ✅ Ternary expressions (a ? b : c)
- ✅ Error handling:
  - ✅ throw statements
  - ✅ try-catch blocks
  - ✅ try-finally blocks
  - ✅ try-catch-finally blocks
- ✅ Built-in function mapping:
  - ✅ Mathematical functions: abs, round, floor, ceil, sqrt, sqr, power, exp, ln, log2, log10
  - ✅ Trigonometric functions: sin, cos, tan, arcsin, arccos, arctan, arctan2
  - ✅ Angle conversion: degtorad, radtodeg
  - ✅ Utility functions: min, max, sign, clamp, point_distance
  - ✅ String functions:
    - ✅ Basic operations: string_length, string_char_at, string_ord_at, string_byte_at, string_byte_length
    - ✅ Searching: string_pos, string_last_pos
    - ✅ Manipulation: string_copy, string_delete, string_insert, string_replace, string_replace_all
    - ✅ Case conversion: string_upper, string_lower
    - ✅ Utility: string_repeat, string_count
    - ✅ Filtering: string_letters, string_digits, string_lettersdigits
    - ✅ Conversion: chr, ansi_char, ord, real, string
    - ✅ Formatting: string_format

### Planned Features

- [x] `with` statement lowering
- [x] Built-in function mapping (expanded to 50+ functions including comprehensive string support)
- [ ] Scope-aware identifier resolution (self, other, global)
- [ ] Script call indirection through runtime wrapper
- [ ] Additional built-in function mapping (array functions, data structure functions)
- [ ] Compound assignment operators (already parsed, may need runtime handling)

## Operator Mapping

The transpiler maps GML-specific operators to their JavaScript equivalents:

| GML Operator | JavaScript Equivalent |
|--------------|-----------------------|
| `div`        | `/`                  |
| `mod`        | `%`                  |
| `and`        | `&&`                 |
| `or`         | `||`                 |
| `xor`        | `^`                  |
| `not`        | `!`                  |
| `==`         | `===`                |
| `!=`         | `!==`                |

## Integration

The transpiler integrates with the broader hot-reload pipeline:

1. **Parser** (`gamemaker-language-parser`) - Parses GML source into an AST
2. **Semantic** (`gamemaker-language-semantic`) - (Future) Provides scope and type information
3. **Transpiler** (this module) - Converts AST to JavaScript
4. **Runtime Wrapper** (`gamemaker-language-runtime-wrapper`) - Applies patches to the running game

## Testing

Run tests with:

```bash
npm test
```

The test suite includes:
- Literal value handling
- Operator mapping verification
- Expression generation
- Error handling
- Patch object creation

## Design Principles

- **Minimal Changes**: Generate JavaScript that closely matches GML semantics
- **Incremental**: Build features progressively with comprehensive tests
- **Runtime Compatibility**: Ensure output works with the runtime wrapper expectations
- **Testable**: Lock in behavior with tests for every feature

## Status

The module is currently in **active development**. It provides basic expression transpilation and serves as the foundation for the full GML → JavaScript pipeline described in `docs/semantic-scope-plan.md`.

## References

- [Semantic Scope Plan](../../docs/semantic-scope-plan.md) - Detailed transpiler architecture
- [Live Reloading Concept](../../docs/live-reloading-concept.md) - Hot-reload workflow
- [Runtime Wrapper](../runtime-wrapper/) - JavaScript runtime integration
