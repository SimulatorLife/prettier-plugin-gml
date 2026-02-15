import assert from "node:assert/strict";
import { describe, it } from "node:test";

import * as Transforms from "../src/transforms/index.js";

void describe("consolidateStructAssignments ownership", () => {
    void it("is not exported by the formatter transform graph", () => {
        assert.equal(Object.hasOwn(Transforms, "consolidateStructAssignmentsTransform"), false);
    });
});
