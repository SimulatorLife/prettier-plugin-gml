import assert from "node:assert/strict";
import os from "node:os";
import { describe, it } from "node:test";

import { fromPosixPath, toPosixPath } from "../path-utils.js";

describe("path utilities", () => {
    it("converts Windows separators to POSIX separators", () => {
        const converted = toPosixPath("\\\\Foo\\Bar\\Baz.gml");
        assert.equal(converted, "/Foo/Bar/Baz.gml");
    });

    it("returns an empty string for non-string inputs", () => {
        assert.equal(toPosixPath(null), "");
        assert.equal(toPosixPath(undefined), "");
        assert.equal(fromPosixPath(null), "");
    });

    it("converts POSIX separators to the current platform separator", () => {
        const native = fromPosixPath("scripts/demo/DemoScript.gml");
        const expected =
            os.platform() === "win32"
                ? "scripts\\demo\\DemoScript.gml"
                : "scripts/demo/DemoScript.gml";
        assert.equal(native, expected);
    });
});
