// Centralized access to shared AST helpers used by the parser adapter.
// This module intentionally wraps deep relative imports so the adapter can
// depend on a stable facade instead of shared internals.
export {
    getNodeStartIndex,
    getNodeEndIndex
} from "../../../shared/ast-locations.js";
export { toMutableArray } from "../../../shared/array-utils.js";
export { visitChildNodes } from "../../../shared/ast/node-helpers.js";
