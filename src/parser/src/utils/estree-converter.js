import { Core } from "@gml-modules/core";
const COMMENT_TYPE_MAP = new Map([
    ["CommentLine", "Line"],
    ["CommentBlock", "Block"],
    ["Whitespace", "Whitespace"]
]);
function normalizeBoundary(boundary) {
    if (boundary == null) {
        return null;
    }
    if (typeof boundary === "number") {
        return Number.isFinite(boundary) ? boundary : null;
    }
    if (typeof boundary !== "object") {
        return null;
    }
    if (Number.isFinite(boundary.index)) {
        return boundary.index;
    }
    if (Number.isFinite(boundary.offset)) {
        return boundary.offset;
    }
    if (Number.isFinite(boundary.start)) {
        return boundary.start;
    }
    return null;
}
function buildLoc(boundaryStart, boundaryEnd) {
    if (!boundaryStart || !boundaryEnd) {
        return null;
    }
    const startLine = boundaryStart.line ?? null;
    const endLine = boundaryEnd.line ?? null;
    if (startLine == null && endLine == null) {
        return null;
    }
    const startColumn = typeof boundaryStart.column === "number" ? boundaryStart.column : null;
    const endColumn = typeof boundaryEnd.column === "number" ? boundaryEnd.column : null;
    return {
        start: {
            line: startLine,
            column: startColumn
        },
        end: {
            line: endLine,
            column: endColumn
        }
    };
}
function convertNode(value, state) {
    if (value === null || value === undefined) {
        return value;
    }
    if (Array.isArray(value)) {
        return value.map((item) => convertNode(item, state));
    }
    if (!Core.isObjectLike(value)) {
        return value;
    }
    const isAstNode = typeof value.type === "string" && value.type.length > 0;
    const result = isAstNode ? { type: value.type } : {};
    const entries = Object.entries(value);
    for (const [key, child] of entries) {
        if (key === "type" || key === "start" || key === "end") {
            continue;
        }
        if (!state.includeComments && key === "comments") {
            continue;
        }
        if (key === "declaration") {
            continue;
        }
        result[key] = convertNode(child, state);
    }
    if (isAstNode) {
        if (COMMENT_TYPE_MAP.has(result.type)) {
            result.type = COMMENT_TYPE_MAP.get(result.type);
        }
        if (state.includeLocations) {
            const loc = buildLoc(value.start, value.end);
            if (loc) {
                result.loc = loc;
            }
        }
        if (state.includeRange) {
            const startIndex = normalizeBoundary(value.start);
            const endIndex = normalizeBoundary(value.end);
            if (startIndex !== null && endIndex !== null) {
                result.start = startIndex;
                result.end = endIndex;
                result.range = [startIndex, endIndex];
            }
        }
    }
    return result;
}
export function convertToESTree(root, options = {}) {
    const state = {
        includeLocations: options.includeLocations !== false,
        includeRange: options.includeRange !== false,
        includeComments: options.includeComments !== false
    };
    return convertNode(root, state);
}
export default convertToESTree;
//# sourceMappingURL=estree-converter.js.map