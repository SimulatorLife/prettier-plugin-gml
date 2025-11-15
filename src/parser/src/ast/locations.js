// Location helpers were moved into @gml-modules/core; re-export them here to
// preserve the historical module path used throughout the parser package.
import { Core } from "@gml-modules/core";
const { AST: { getNodeStartIndex, getNodeEndIndex, getNodeRangeIndices, getNodeStartLine, getNodeEndLine, cloneLocation, assignClonedLocation } } = Core;
export { getNodeStartIndex, getNodeEndIndex, getNodeRangeIndices, getNodeStartLine, getNodeEndLine, cloneLocation, assignClonedLocation };

