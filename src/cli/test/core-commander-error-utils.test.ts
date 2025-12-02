import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isCommanderErrorLike } from "../src/cli-core/commander-error-utils.js";

void describe("commander error utils", () => {
    void it("recognizes commander-style errors by capability", () => {
        const error: Error & { code?: string; exitCode?: number } = new Error(
            "bad option"
        );
        error.code = "commander.invalidOption";
        error.exitCode = 2;

        assert.equal(isCommanderErrorLike(error), true);
        assert.equal(
            isCommanderErrorLike({
                message: "bad option",
                code: "commander.invalidOption"
            }),
            true
        );
        assert.equal(
            isCommanderErrorLike({
                message: "bad option",
                code: "ERR_GENERIC"
            }),
            false
        );
        assert.equal(
            isCommanderErrorLike({
                message: "bad option",
                code: "commander.invalidOption",
                exitCode: "2"
            }),
            false
        );
    });
});
