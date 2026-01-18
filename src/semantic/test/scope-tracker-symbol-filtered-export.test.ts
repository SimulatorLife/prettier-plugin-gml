import assert from "node:assert/strict";
import test from "node:test";

import ScopeTracker from "../src/scopes/scope-tracker.js";

/**
 * Helper to create a tracker with a declared variable and optional references.
 * Reduces test setup duplication.
 *
 * @param varName - Name of the variable to declare
 * @param referenceCount - Number of references to add (default: 0)
 * @returns Configured ScopeTracker instance
 */
function createTrackerWithVariable(varName: string, referenceCount = 0): ScopeTracker {
    const DECLARATION_LINE = 1;
    const REFERENCE_START_LINE = 2;
    const CHARS_PER_LINE = 10;

    const tracker = new ScopeTracker({ enabled: true });
    tracker.enterScope("program");

    tracker.declare(varName, {
        name: varName,
        start: { line: DECLARATION_LINE, column: 0, index: 0 },
        end: { line: DECLARATION_LINE, column: varName.length, index: varName.length }
    });

    for (let i = 0; i < referenceCount; i += 1) {
        const lineNum = REFERENCE_START_LINE + i;
        const startIndex = (lineNum - 1) * CHARS_PER_LINE;
        tracker.reference(varName, {
            name: varName,
            start: { line: lineNum, column: 0, index: startIndex },
            end: { line: lineNum, column: varName.length, index: startIndex + varName.length }
        });
    }

    return tracker;
}

void test("exportOccurrencesBySymbols: returns empty array for empty symbol set", () => {
    const tracker = new ScopeTracker({ enabled: true });
    tracker.enterScope("program");
    tracker.declare("symbol1", {
        name: "symbol1",
        start: { line: 1, column: 0, index: 0 },
        end: { line: 1, column: 7, index: 7 }
    });

    const result = tracker.exportOccurrencesBySymbols([]);

    assert.deepStrictEqual(result, []);
});

void test("exportOccurrencesBySymbols: returns occurrences for single requested symbol", () => {
    const tracker = new ScopeTracker({ enabled: true });
    const scope = tracker.enterScope("program");

    tracker.declare("targetSymbol", {
        name: "targetSymbol",
        start: { line: 1, column: 0, index: 0 },
        end: { line: 1, column: 12, index: 12 }
    });

    tracker.declare("otherSymbol", {
        name: "otherSymbol",
        start: { line: 2, column: 0, index: 20 },
        end: { line: 2, column: 11, index: 31 }
    });

    const result = tracker.exportOccurrencesBySymbols(["targetSymbol"]);

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].scopeId, scope.id);
    assert.strictEqual(result[0].occurrences.length, 1);
    assert.deepStrictEqual(result[0].occurrences[0].range, [1, 0, 1, 12]);
    assert.strictEqual(result[0].occurrences[0].symbol, `${scope.id}::targetSymbol`);
    assert.strictEqual(result[0].occurrences[0].symbolRoles, 1); // ROLE_DEF
});

void test("exportOccurrencesBySymbols: returns occurrences for multiple requested symbols", () => {
    const tracker = new ScopeTracker({ enabled: true });
    const scope = tracker.enterScope("program");

    tracker.declare("symbol1", {
        name: "symbol1",
        start: { line: 1, column: 0, index: 0 },
        end: { line: 1, column: 7, index: 7 }
    });

    tracker.declare("symbol2", {
        name: "symbol2",
        start: { line: 2, column: 0, index: 20 },
        end: { line: 2, column: 7, index: 27 }
    });

    tracker.declare("symbol3", {
        name: "symbol3",
        start: { line: 3, column: 0, index: 40 },
        end: { line: 3, column: 7, index: 47 }
    });

    const result = tracker.exportOccurrencesBySymbols(["symbol1", "symbol3"]);

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].occurrences.length, 2);

    const symbols = new Set(result[0].occurrences.map((occ) => occ.symbol));
    assert.ok(symbols.has(`${scope.id}::symbol1`));
    assert.ok(symbols.has(`${scope.id}::symbol3`));
    assert.ok(!symbols.has(`${scope.id}::symbol2`));
});

void test("exportOccurrencesBySymbols: filters references when includeReferences is true", () => {
    const tracker = createTrackerWithVariable("myVar", 2);

    const result = tracker.exportOccurrencesBySymbols(["myVar"], {
        includeReferences: true
    });

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].occurrences.length, 3); // 1 declaration + 2 references

    const roles = result[0].occurrences.map((occ) => occ.symbolRoles);
    assert.strictEqual(roles.filter((r) => r === 1).length, 1); // 1 DEF
    assert.strictEqual(roles.filter((r) => r === 0).length, 2); // 2 REF
});

void test("exportOccurrencesBySymbols: excludes references when includeReferences is false", () => {
    const tracker = createTrackerWithVariable("myVar", 1);

    const result = tracker.exportOccurrencesBySymbols(["myVar"], {
        includeReferences: false
    });

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].occurrences.length, 1); // Only declaration
    assert.strictEqual(result[0].occurrences[0].symbolRoles, 1); // ROLE_DEF
});

void test("exportOccurrencesBySymbols: filters to specific scope when scopeId provided", () => {
    const tracker = new ScopeTracker({ enabled: true });
    tracker.enterScope("program");

    tracker.declare("sharedSymbol", {
        name: "sharedSymbol",
        start: { line: 1, column: 0, index: 0 },
        end: { line: 1, column: 12, index: 12 }
    });

    const scope2 = tracker.enterScope("function");

    tracker.declare("sharedSymbol", {
        name: "sharedSymbol",
        start: { line: 5, column: 0, index: 50 },
        end: { line: 5, column: 12, index: 62 }
    });

    const result = tracker.exportOccurrencesBySymbols(["sharedSymbol"], {
        scopeId: scope2.id
    });

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].scopeId, scope2.id);
    assert.strictEqual(result[0].occurrences.length, 1);
    assert.deepStrictEqual(result[0].occurrences[0].range, [5, 0, 5, 12]);
});

void test("exportOccurrencesBySymbols: uses custom symbol generator when provided", () => {
    const tracker = new ScopeTracker({ enabled: true });
    tracker.enterScope("program");

    tracker.declare("scr_player_move", {
        name: "scr_player_move",
        start: { line: 1, column: 0, index: 0 },
        end: { line: 1, column: 15, index: 15 }
    });

    const result = tracker.exportOccurrencesBySymbols(["scr_player_move"], {
        symbolGenerator: (name) => `gml/script/${name}`
    });

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].occurrences.length, 1);
    assert.strictEqual(result[0].occurrences[0].symbol, "gml/script/scr_player_move");
});

void test("exportOccurrencesBySymbols: accepts Set as input", () => {
    const tracker = new ScopeTracker({ enabled: true });
    tracker.enterScope("program");

    tracker.declare("symbol1", {
        name: "symbol1",
        start: { line: 1, column: 0, index: 0 },
        end: { line: 1, column: 7, index: 7 }
    });

    tracker.declare("symbol2", {
        name: "symbol2",
        start: { line: 2, column: 0, index: 20 },
        end: { line: 2, column: 7, index: 27 }
    });

    const symbolSet = new Set(["symbol1", "symbol2"]);
    const result = tracker.exportOccurrencesBySymbols(symbolSet);

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].occurrences.length, 2);
});

void test("exportOccurrencesBySymbols: omits scopes with no matching symbols", () => {
    const tracker = new ScopeTracker({ enabled: true });
    tracker.enterScope("program");

    tracker.declare("globalVar", {
        name: "globalVar",
        start: { line: 1, column: 0, index: 0 },
        end: { line: 1, column: 9, index: 9 }
    });

    const scope2 = tracker.enterScope("function");

    tracker.declare("localVar", {
        name: "localVar",
        start: { line: 5, column: 0, index: 50 },
        end: { line: 5, column: 8, index: 58 }
    });

    // Request only globalVar - scope2 should be omitted
    const result = tracker.exportOccurrencesBySymbols(["globalVar"]);

    assert.strictEqual(result.length, 1);
    assert.notStrictEqual(result[0].scopeId, scope2.id);
});

void test("exportOccurrencesBySymbols: handles symbols across multiple scopes", () => {
    const tracker = new ScopeTracker({ enabled: true });
    const scope1 = tracker.enterScope("program");

    tracker.declare("config", {
        name: "config",
        start: { line: 1, column: 0, index: 0 },
        end: { line: 1, column: 6, index: 6 }
    });

    const scope2 = tracker.enterScope("function");

    tracker.reference("config", {
        name: "config",
        start: { line: 5, column: 0, index: 50 },
        end: { line: 5, column: 6, index: 56 }
    });

    tracker.exitScope();

    const scope3 = tracker.enterScope("function");

    tracker.reference("config", {
        name: "config",
        start: { line: 10, column: 0, index: 100 },
        end: { line: 10, column: 6, index: 106 }
    });

    const result = tracker.exportOccurrencesBySymbols(["config"]);

    assert.strictEqual(result.length, 3);
    assert.strictEqual(result[0].scopeId, scope1.id);
    assert.strictEqual(result[1].scopeId, scope2.id);
    assert.strictEqual(result[2].scopeId, scope3.id);

    // scope1 should have declaration
    assert.strictEqual(result[0].occurrences[0].symbolRoles, 1); // ROLE_DEF

    // scope2 and scope3 should have references
    assert.strictEqual(result[1].occurrences[0].symbolRoles, 0); // ROLE_REF
    assert.strictEqual(result[2].occurrences[0].symbolRoles, 0); // ROLE_REF
});

void test("exportOccurrencesBySymbols: returns results sorted by scopeId", () => {
    const tracker = new ScopeTracker({ enabled: true });

    // Create scopes in non-alphabetical order
    tracker.enterScope("program");
    tracker.declare("symbol", {
        name: "symbol",
        start: { line: 1, column: 0, index: 0 },
        end: { line: 1, column: 6, index: 6 }
    });

    tracker.exitScope();

    tracker.enterScope("function");
    tracker.declare("symbol", {
        name: "symbol",
        start: { line: 5, column: 0, index: 50 },
        end: { line: 5, column: 6, index: 56 }
    });

    const result = tracker.exportOccurrencesBySymbols(["symbol"]);

    assert.strictEqual(result.length, 2);
    // Results should be sorted by scopeId
    const scopeIds = [result[0].scopeId, result[1].scopeId];
    const sortedIds = [...scopeIds].toSorted();
    assert.deepStrictEqual(scopeIds, sortedIds);
});

void test("exportOccurrencesBySymbols: handles occurrences without location data gracefully", () => {
    const tracker = new ScopeTracker({ enabled: true });
    tracker.enterScope("program");

    // Declaration with incomplete location data
    tracker.declare("badSymbol", {
        name: "badSymbol"
        // Missing start/end
    });

    tracker.declare("goodSymbol", {
        name: "goodSymbol",
        start: { line: 2, column: 0, index: 20 },
        end: { line: 2, column: 10, index: 30 }
    });

    const result = tracker.exportOccurrencesBySymbols(["badSymbol", "goodSymbol"]);

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].occurrences.length, 1);
    assert.strictEqual(result[0].occurrences[0].symbol.includes("goodSymbol"), true);
});

void test("exportOccurrencesBySymbols: performance optimization for hot reload use case", () => {
    const tracker = new ScopeTracker({ enabled: true });
    tracker.enterScope("program");

    // Declare many symbols
    for (let i = 0; i < 100; i += 1) {
        tracker.declare(`symbol_${i}`, {
            name: `symbol_${i}`,
            start: { line: i + 1, column: 0, index: i * 20 },
            end: { line: i + 1, column: 10, index: i * 20 + 10 }
        });
    }

    // Request only a few symbols (typical hot reload scenario)
    const changedSymbols = ["symbol_5", "symbol_42", "symbol_99"];
    const result = tracker.exportOccurrencesBySymbols(changedSymbols);

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].occurrences.length, 3);

    const exportedSymbols = result[0].occurrences.map((occ) => occ.symbol.split("::")[1]);

    const sortedExpected = [...changedSymbols].toSorted();
    const sortedExported = [...exportedSymbols].toSorted();
    assert.deepStrictEqual(sortedExported, sortedExpected);
});
