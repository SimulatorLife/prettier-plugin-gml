// Location helpers were moved into @gml-modules/core; re-export them here to
// preserve the historical module path used throughout the parser package.
export {
    getNodeStartIndex,
    getNodeEndIndex,
    getNodeRangeIndices,
    getNodeStartLine,
    getNodeEndLine,
    cloneLocation,
    assignClonedLocation
} from "@gml-modules/core";
