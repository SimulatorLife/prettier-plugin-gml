import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ParserTransform } from "../../src/transforms/functional-transform.js";
import * as Transforms from "../../src/transforms/index.js";
import { availableTransforms, getParserTransform } from "../../src/transforms/index.js";

function isParserTransform(value: unknown): value is ParserTransform {
    return (
        typeof value === "object" &&
        value !== null &&
        "name" in value &&
        "defaultOptions" in value &&
        "transform" in value &&
        typeof (value as ParserTransform).name === "string" &&
        typeof (value as ParserTransform).defaultOptions === "object" &&
        typeof (value as ParserTransform).transform === "function"
    );
}

const removedSemanticTransforms = [
    "annotateStaticFunctionOverridesTransform",
    "collapseRedundantMissingCallArgumentsTransform",
    "condenseGuardStatementsTransform",
    "consolidateStructAssignmentsTransform",
    "convertStringConcatenationsTransform",
    "convertUndefinedGuardAssignmentsTransform",
    "optimizeLogicalExpressionsTransform"
] as const;

void describe("Transform registry", () => {
    void it("exposes every registered transform that implements the ParserTransform interface", () => {
        for (const name of availableTransforms) {
            const transform = getParserTransform(name);
            assert.strictEqual(transform.name, name);
            assert.ok(isParserTransform(transform), `Transform "${name}" must implement ParserTransform interface`);
        }
    });

    void it("keeps semantic/content rewrites out of formatter transform exports", () => {
        for (const transformName of removedSemanticTransforms) {
            assert.equal(
                Object.hasOwn(Transforms, transformName),
                false,
                `Formatter transform namespace must not export ${transformName}`
            );
        }
    });

    void it("keeps semantic/content rewrites out of the formatter transform registry", () => {
        for (const transformName of removedSemanticTransforms) {
            assert.equal(
                availableTransforms.includes(transformName as (typeof availableTransforms)[number]),
                false,
                `Formatter transform registry must not include ${transformName}`
            );
        }
    });
});
