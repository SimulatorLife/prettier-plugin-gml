import assert from "node:assert/strict";
import test from "node:test";

import {
    setIdentifierCaseOption,
    getIdentifierCaseOptionStore,
    clearIdentifierCaseOptionStore,
    MAX_IDENTIFIER_CASE_OPTION_STORE_ENTRIES,
    deleteIdentifierCaseOption
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

test("deleteIdentifierCaseOption removes values from options and store", () => {
    clearIdentifierCaseOptionStore(null);

    const options = buildOptions(0);
    const renameMap = new Map([["key", "value"]]);
    setIdentifierCaseOption(options, "__identifierCaseRenameMap", renameMap);
    setIdentifierCaseOption(options, "__identifierCaseRenamePlan", { id: 1 });

    deleteIdentifierCaseOption(options, "__identifierCaseRenameMap");

    assert.equal(options.__identifierCaseRenameMap, undefined);
    const store = getIdentifierCaseOptionStore(options.filepath);
    assert.ok(store, "expected store to remain after deleting single key");
    assert.equal(store.__identifierCaseRenameMap, undefined);
    assert.equal(store.__identifierCaseRenamePlan.id, 1);

    deleteIdentifierCaseOption(options, "__identifierCaseRenamePlan");

    assert.equal(options.__identifierCaseRenamePlan, undefined);
    const emptyStore = getIdentifierCaseOptionStore(options.filepath);
    assert.equal(emptyStore, null, "expected store to be pruned when empty");

    clearIdentifierCaseOptionStore(null);
});

test("option store skips blacklisted keys", () => {
    clearIdentifierCaseOptionStore(null);

    const options = buildOptions(0);
    const projectIndex = { projectRoot: "/project" };

    setIdentifierCaseOption(
        options,
        "__identifierCaseProjectIndex",
        projectIndex
    );
    setIdentifierCaseOption(options, "__identifierCaseRenamePlan", { id: 1 });

    const store = getIdentifierCaseOptionStore(options.filepath);
    assert.ok(store, "expected store entry to exist");
    assert.equal(store.__identifierCaseProjectIndex, undefined);
    assert.equal(store.__identifierCaseRenamePlan.id, 1);

    clearIdentifierCaseOptionStore(null);
});
