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
- ✅ Control flow statements:
  - ✅ if/else statements (including else-if chains)
  - ✅ for loops
  - ✅ while loops
  - ✅ do-until loops (converted to do-while with negated condition)
  - ✅ switch statements with case and default
- ✅ Loop control:
  - ✅ break statements
  - ✅ continue statements
- ✅ return statements (with and without values)
- ✅ Parenthesized expressions
- ✅ Block statements
- ✅ Nested control flow structures

### Planned Features

- [ ] Function declarations
- [ ] Additional control flow (repeat)
- [ ] `with` statement lowering
- [ ] Scope-aware identifier resolution (self, other, global)
- [ ] Script call indirection through runtime wrapper
- [ ] Built-in function mapping
- [ ] Struct and array literals
- [ ] Advanced expression forms (ternary, compound assignments)
- [ ] Try-catch-finally error handling

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
