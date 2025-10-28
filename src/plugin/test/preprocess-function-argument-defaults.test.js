import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { preprocessFunctionArgumentDefaults } from "../src/ast-transforms/preprocess-function-argument-defaults.js";

function createFunctionDeclaration(params) {
    return {
        type: "FunctionDeclaration",
        id: { type: "Identifier", name: "example" },
        params,
        body: { type: "BlockStatement", body: [] }
    };
}

describe("preprocessFunctionArgumentDefaults", () => {
    it("adds undefined defaults for parameters that follow explicit defaults", () => {
        const functionNode = createFunctionDeclaration([
            { type: "Identifier", name: "vbuff" },
            {
                type: "DefaultParameter",
                left: { type: "Identifier", name: "colour" },
                right: { type: "Identifier", name: "c_white" }
            },
            {
                type: "DefaultParameter",
                left: { type: "Identifier", name: "alpha" },
                right: { type: "Literal", value: 1, raw: "1" }
            },
            { type: "Identifier", name: "trans_mat" }
        ]);

        const ast = { type: "Program", body: [functionNode] };

        preprocessFunctionArgumentDefaults(ast);

        const trailingParam = functionNode.params[3];
        assert.equal(trailingParam?.type, "DefaultParameter");
        assert.equal(trailingParam?.left?.type, "Identifier");
        assert.equal(trailingParam?.left?.name, "trans_mat");
        assert.equal(trailingParam?.right?.type, "Identifier");
        assert.equal(trailingParam?.right?.name, "undefined");
        assert.equal(trailingParam?._featherOptionalParameter, true);
    });
});
