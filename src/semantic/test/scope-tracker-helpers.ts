import ScopeTracker from "../src/scopes/scope-tracker.js";

export type SourceLocation = {
    line: number;
    index: number;
};

export type SourceRange = {
    start: SourceLocation;
    end: SourceLocation;
};

export function createLocation(line: number, index: number = 0): SourceLocation {
    return { line, index };
}

export function createRange(
    startLineOrLine: number,
    startIndexOrStartIdx: number,
    endLineOrEndIdx: number,
    endIndex?: number
): SourceRange {
    if (endIndex === undefined) {
        return {
            start: createLocation(startLineOrLine, startIndexOrStartIdx),
            end: createLocation(startLineOrLine, endLineOrEndIdx)
        };
    }
    return {
        start: createLocation(startLineOrLine, startIndexOrStartIdx),
        end: createLocation(endLineOrEndIdx, endIndex)
    };
}

export function createSymbolDeclaration(name: string, line: number, startIdx: number, endIdx: number) {
    return {
        name,
        start: { line, column: 0, index: startIdx },
        end: { line, column: endIdx - startIdx, index: endIdx }
    };
}

export function createSymbolReference(name: string, line: number, startIdx: number, endIdx: number) {
    return {
        name,
        start: { line, column: startIdx - (line > 1 ? startIdx : 0), index: startIdx },
        end: { line, column: endIdx - (line > 1 ? startIdx : 0), index: endIdx }
    };
}

export function declareTwoGlobalSymbols(tracker: ScopeTracker) {
    tracker.declare("globalVar", createSymbolDeclaration("globalVar", 1, 0, 9));
    tracker.declare("anotherGlobal", createSymbolDeclaration("anotherGlobal", 2, 10, 23));
}

export function setupNestedScopes(tracker: ScopeTracker) {
    tracker.enterScope("program");
    const programScope = tracker.currentScope();
    tracker.declare("globalVar", createRange(1, 0, 9));

    tracker.enterScope("function");
    const functionScope = tracker.currentScope();
    tracker.declare("localVar", createRange(2, 0, 8));

    return { programScope, functionScope };
}
