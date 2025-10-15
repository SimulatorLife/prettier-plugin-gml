import assert from "node:assert/strict";
import test from "node:test";

import {
    setIdentifierCaseOption,
    getIdentifierCaseOptionStore,
    clearIdentifierCaseOptionStore,
    MAX_IDENTIFIER_CASE_OPTION_STORE_ENTRIES
} from "../src/identifier-case/option-store.js";

function buildOptions(fileIndex, overrides = {}) {
    return {
        filepath: `/project/scripts/file-${fileIndex}.gml`,
        ...overrides
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

test("option store honours the configured max entries", () => {
    clearIdentifierCaseOptionStore(null);

    const customMaxEntries = 16;
    const override = {
        gmlIdentifierCaseOptionStoreMaxEntries: customMaxEntries
    };
    const totalEntries = customMaxEntries + 4;

    for (let index = 0; index < totalEntries; index += 1) {
        const options = buildOptions(index, override);
        setIdentifierCaseOption(options, "__identifierCaseRenamePlan", {
            id: index
        });
    }

    const evictedCount = totalEntries - customMaxEntries;

    for (let index = 0; index < evictedCount; index += 1) {
        const store = getIdentifierCaseOptionStore(
            buildOptions(index, override).filepath
        );
        assert.equal(store, null, `expected index ${index} to be evicted`);
    }

    for (let index = evictedCount; index < totalEntries; index += 1) {
        const store = getIdentifierCaseOptionStore(
            buildOptions(index, override).filepath
        );
        assert.ok(store, `expected store for index ${index} to remain`);
        assert.equal(store.__identifierCaseRenamePlan.id, index);
    }

    clearIdentifierCaseOptionStore(null);
});

test("option store keeps all entries when eviction is disabled", () => {
    clearIdentifierCaseOptionStore(null);

    const override = {
        gmlIdentifierCaseOptionStoreMaxEntries: 0
    };
    const totalEntries = MAX_IDENTIFIER_CASE_OPTION_STORE_ENTRIES + 8;

    for (let index = 0; index < totalEntries; index += 1) {
        const options = buildOptions(index, override);
        setIdentifierCaseOption(options, "__identifierCaseRenamePlan", {
            id: index
        });
    }

    for (let index = 0; index < totalEntries; index += 1) {
        const store = getIdentifierCaseOptionStore(
            buildOptions(index, override).filepath
        );
        assert.ok(store, `expected store for index ${index} to remain`);
        assert.equal(store.__identifierCaseRenamePlan.id, index);
    }

    clearIdentifierCaseOptionStore(null);
});
