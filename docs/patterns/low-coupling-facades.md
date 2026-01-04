# Low Coupling Pattern: Domain-Specific Utility Facades

## Overview

This document describes the "Domain-Specific Utility Facade" pattern implemented to reduce coupling within the codebase, particularly in deeply nested subsystems.

## Problem

Files in deeply nested directory structures (e.g., `src/comments/doc-comment/service/`) were importing utilities using deep relative paths like `../../../utils/...`. This created several problems:

1. **Fragile Dependencies**: Changes to directory structure require updating many import paths
2. **Tight Coupling**: Files depend directly on internal implementation details
3. **Poor Maintainability**: Difficult to understand dependencies at a glance
4. **Refactoring Risk**: Moving files or reorganizing utilities breaks many imports

## Solution: Domain-Specific Utility Facades

Instead of having nested files import utilities via deep relative paths, create a local facade file that re-exports the utilities needed by that subsystem.

### Structure

```
src/comments/doc-comment/
├── utils.ts              # ← Facade: re-exports utilities needed by this subsystem
├── service/
│   ├── synthetic-merge.ts        # ← Imports from ../utils.js
│   ├── synthetic-generation.ts   # ← Imports from ../utils.js
│   └── ...
└── manager.ts            # ← Imports from ./utils.js
```

### Example Implementation

**Before:**
```typescript
// src/comments/doc-comment/service/synthetic-merge.ts
import { coercePositiveIntegerOption } from "../../../utils/numeric-options.js";
import { clamp } from "../../../utils/number.js";
import { findLastIndex, isNonEmptyArray, toMutableArray } from "../../../utils/array.js";
import { isNonEmptyString, isNonEmptyTrimmedString, toTrimmedString } from "../../../utils/string.js";
```

**After:**
```typescript
// src/comments/doc-comment/utils.ts (NEW FACADE)
/**
 * Local facade for utility functions used by doc-comment processing.
 */

export {
    compactArray,
    findLastIndex,
    isNonEmptyArray,
    toMutableArray
} from "../../utils/array.js";

export {
    capitalize,
    getNonEmptyString,
    isNonEmptyTrimmedString,
    toTrimmedString
} from "../../utils/string.js";

export { clamp } from "../../utils/number.js";
export { coercePositiveIntegerOption } from "../../utils/numeric-options.js";

// src/comments/doc-comment/service/synthetic-merge.ts (UPDATED)
import {
    clamp,
    coercePositiveIntegerOption,
    findLastIndex,
    isNonEmptyArray,
    isNonEmptyString,
    isNonEmptyTrimmedString,
    toMutableArray,
    toTrimmedString
} from "../utils.js";  // ← Single, stable import path
```

## Benefits

1. **Reduced Coupling**: Service files depend on a local contract rather than deep paths
2. **Improved Maintainability**: Utility reorganization only requires updating the facade
3. **Enhanced Clarity**: The facade explicitly documents which utilities the subsystem depends on
4. **Easier Refactoring**: Moving files within the subsystem doesn't break imports
5. **Stable Paths**: Import paths are shorter and less fragile

## When to Use This Pattern

Apply this pattern when:

- A subsystem has files nested 3+ levels deep
- Files within that subsystem need to import shared utilities
- The imports would require `../../../` or deeper relative paths
- The subsystem has a clear domain boundary

Do NOT use this pattern for:

- Cross-workspace imports (use `@gml-modules/workspace-name` instead)
- Shallow directory structures (1-2 levels)
- One-off utility imports

## Example: Core Workspace Implementation

The `@gml-modules/core` workspace had the most significant coupling issues. We created two facades:

1. **`src/comments/doc-comment/utils.ts`**
   - Serves files in the doc-comment subsystem
   - Re-exports array, string, numeric, and object utilities
   - Updated 10 files to use the facade

2. **`src/comments/line-comment/utils.ts`**
   - Serves files in the line-comment subsystem  
   - Re-exports object, string, and capability-probe utilities
   - Updated 2 files to use the facade

**Results:**
- Eliminated all `../../../` imports from the Core workspace
- Reduced coupling from utilities to local contracts
- All 275 core tests continue to pass
- Build completes successfully with no errors

## Related Patterns

- **Public API Pattern**: Cross-workspace imports should always use `@gml-modules/workspace` rather than deep paths
- **Namespace Exports**: Workspaces should export a single namespace (e.g., `Core`) at their top level
- **Barrel Files**: Use `index.ts` files to re-export public APIs at directory boundaries
