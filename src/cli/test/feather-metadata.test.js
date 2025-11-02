import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
    FEATHER_METADATA_PATH,
    loadBundledFeatherMetadata
} from "../src/modules/feather/metadata.js";
import { REPO_ROOT } from "../src/shared/workspace-paths.js";

test("feather metadata loader resolves bundled snapshot", () => {
    const expectedPath = path.resolve(
        REPO_ROOT,
        "resources",
        "feather-metadata.json"
    );
    assert.equal(FEATHER_METADATA_PATH, expectedPath);

    const metadata = loadBundledFeatherMetadata();
    assert.ok(metadata && typeof metadata === "object");
    assert.ok(Array.isArray(metadata.diagnostics));
});
