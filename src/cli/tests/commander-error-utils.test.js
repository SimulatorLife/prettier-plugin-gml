import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isCommanderErrorLike } from "../lib/commander-error-utils.js";

describe("commander error utils", () => {
    it("recognizes commander-style errors by capability", () => {
        const error = new Error("bad option");
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
