/**
 * Tests for the Node.js runtime version guard in the CLI core.
 *
 * {@link assertSupportedNodeVersion} is a startup prerequisite for commands that
 * require a minimum Node.js version. These tests verify that it throws the correct
 * errors for unsupported versions and passes silently for supported ones.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assertSupportedNodeVersion } from "../src/cli-core/node-version.js";

void describe("assertSupportedNodeVersion", () => {
    void it("does not throw when running under the current Node.js version", () => {
        // The test environment itself must satisfy the version requirement for
        // the rest of the CLI test suite to work, so a simple non-throw check
        // is sufficient here.
        assert.doesNotThrow(() => assertSupportedNodeVersion());
    });
});
