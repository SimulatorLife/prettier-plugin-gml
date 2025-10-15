import assert from "node:assert/strict";
import test from "node:test";

import {
    setIdentifierCaseOption,
    getIdentifierCaseOptionStore,
    clearIdentifierCaseOptionStore,
    MAX_IDENTIFIER_CASE_OPTION_STORE_ENTRIES
} from "../src/identifier-case/option-store.js";

function buildOptions(fileIndex) {
    return {
        filepath: `/project/scripts/file-${fileIndex}.gml`
    };
}

test("option store evicts oldest entries when the limit is exceeded", () => {
    clearIdentifierCaseOptionStore(null);

    const totalEntries = MAX_IDENTIFIER_CASE_OPTION_STORE_ENTRIES + 16;

    for (let index = 0; index < totalEntries; index += 1) {
        const options = buildOptions(index);
        setIdentifierCaseOption(options, "__identifierCaseRenamePlan", {
            id: index
        });
    }

    const evictedCount =
        totalEntries - MAX_IDENTIFIER_CASE_OPTION_STORE_ENTRIES;

    for (let index = 0; index < evictedCount; index += 1) {
        const store = getIdentifierCaseOptionStore(
            buildOptions(index).filepath
        );
        assert.equal(
            store,
            null,
            `expected store for index ${index} to be evicted`
        );
    }

    for (let index = evictedCount; index < totalEntries; index += 1) {
        const store = getIdentifierCaseOptionStore(
            buildOptions(index).filepath
        );
        assert.ok(store, `expected store for index ${index} to remain`);
        assert.equal(store.__identifierCaseRenamePlan.id, index);
    }

    clearIdentifierCaseOptionStore(null);
});
