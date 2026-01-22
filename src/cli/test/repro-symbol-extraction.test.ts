import assert from "node:assert";
import { test } from "node:test";

import { Parser } from "@gml-modules/parser";

import { createSemanticOracle } from "../../transpiler/src/emitter/semantic-factory.js";
import { extractSymbolsFromAst } from "../src/modules/transpilation/symbol-extraction.js";

test("extractSymbolsFromAst finds twojointik in InverseKinematics.gml", () => {
    const sourceText = `
function twojointik(x1, y1, z1, x2dir, y2dir, z2dir, x3, y3, z3, length1, length2) {
    /*
	    Snidr's Two-joint Inverse Kinematics Algorithm
	    This is a two-joint IK algorithm I've invented myself. It is a very crude way of doing inverse kinematics, but it works well for small adjustments of foot position and the like.

	    The algorithm takes in the positions of two nodes
    */
    var p;
    // ...
    return [x2, y2, z2, x3, y3, z3];
}
    `;

    const parser = new Parser.GMLParser(sourceText, {});
    const ast = parser.parse();

    // filePath is irrelevant for symbol name extraction in isolation logic,
    // but usually it's "vendor/3DSpider/scripts/InverseKinematics/InverseKinematics.gml"
    // The symbol ID should be gml_Script_twojointik
    const symbols = extractSymbolsFromAst(ast, "vendor/3DSpider/scripts/InverseKinematics/InverseKinematics.gml");

    console.log("Extracted Symbols:", symbols);

    assert.ok(symbols.includes("gml_Script_twojointik"), "Should extract gml_Script_twojointik");
});

test("SemanticOracle classifies twojointik as script", () => {
    const scriptNames = new Set(["twojointik"]);
    const oracle = createSemanticOracle({ scriptNames });

    // Mock CallExpressionNode
    const callNode = {
        type: "CallExpression",
        object: {
            type: "Identifier",
            name: "twojointik"
        },
        arguments: []
    } as any;

    const kind = oracle.callTargetKind(callNode);
    console.log("Call kind:", kind);
    assert.strictEqual(kind, "script", "Should classify as script");
});
