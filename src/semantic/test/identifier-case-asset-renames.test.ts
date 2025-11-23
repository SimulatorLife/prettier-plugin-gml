import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { planAssetRenames } from "../src/identifier-case/asset-renames.js";
import { IdentifierCaseStyle } from "../src/identifier-case/options.js";

describe("identifier case asset rename planning", () => {
    it("throws when provided an unknown asset style", () => {
        assert.throws(
            () =>
                planAssetRenames({
                    projectIndex: { resources: {} },
                    assetStyle: "kebab" as any
                }),
            /invalid identifier case style/i
        );
    });

    it("accepts recognized asset styles", () => {
        const result = planAssetRenames({
            projectIndex: { resources: {} },
            assetStyle: IdentifierCaseStyle.CAMEL
        });

        assert.deepStrictEqual(result, {
            operations: [],
            conflicts: [],
            renames: []
        });
    });
});
