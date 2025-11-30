import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    registerIgnorePath,
    hasRegisteredIgnorePath,
    resetRegisteredIgnorePaths
} from "../src/shared/ignore-path-registry.js";

describe("ignore path registry", () => {
    it("deduplicates registered paths", () => {
        resetRegisteredIgnorePaths();

        registerIgnorePath("/tmp/example.ignore");
        registerIgnorePath("/tmp/example.ignore");
        registerIgnorePath("/tmp/extra.ignore");

        assert.ok(hasRegisteredIgnorePath("/tmp/example.ignore"));
        assert.ok(hasRegisteredIgnorePath("/tmp/extra.ignore"));
    });

    it("resets all tracked paths", () => {
        resetRegisteredIgnorePaths();

        for (let index = 0; index < 100; index += 1) {
            registerIgnorePath(`/tmp/path-${index}`);
        }

        assert.ok(hasRegisteredIgnorePath("/tmp/path-42"));

        resetRegisteredIgnorePaths();

        assert.strictEqual(hasRegisteredIgnorePath("/tmp/path-42"), false);
    });
});
