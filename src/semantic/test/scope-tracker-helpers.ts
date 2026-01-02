import ScopeTracker from "../src/scopes/scope-tracker.js";

export function createLocation(line: number, index: number = 0) {
    return { line, index };
}

export function createRange(line: number, startIdx: number, endIdx: number) {
    return {
        start: createLocation(line, startIdx),
        end: createLocation(line, endIdx)
    };
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
