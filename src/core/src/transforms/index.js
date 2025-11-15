// Core transforms adapter: expose intentional wrapper functions around the
// parser's transform registry so callers depend on the core API surface.
import {
    applyTransforms as parserApplyTransforms,
    availableTransforms as parserAvailableTransforms
} from "@gml-modules/parser";

export function applyTransforms(ast, transformNames = [], options = {}) {
    return parserApplyTransforms(ast, transformNames, options);
}



export function listAvailableTransforms() {
    return parserAvailableTransforms.slice();
}
export {availableTransforms} from "@gml-modules/parser";
