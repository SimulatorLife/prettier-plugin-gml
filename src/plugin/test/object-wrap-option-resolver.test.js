import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    ObjectWrapOption,
    resolveObjectWrapOption
} from "../src/options/object-wrap-option.js";

describe("resolveObjectWrapOption", () => {
    it("preserves object wrapping by default", () => {
        const resolved = resolveObjectWrapOption();

        assert.equal(resolved, ObjectWrapOption.PRESERVE);
    });

    it("honours the collapse option provided by Prettier", () => {
        const resolved = resolveObjectWrapOption({
            objectWrap: ObjectWrapOption.COLLAPSE
        });

        assert.equal(resolved, ObjectWrapOption.COLLAPSE);
    });
});
