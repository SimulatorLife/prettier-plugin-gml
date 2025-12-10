import assert from "node:assert/strict";
import { test } from "node:test";

import { doc as prettierDoc } from "prettier";

import {
    buildSyntheticDocComment,
    buildSyntheticDocCommentDoc
} from "../src/printer/synthetic-doc-comment-builder.js";

void test("buildSyntheticDocComment converts core doc lines into a Prettier doc", () => {
    const syntheticResult = {
        docLines: ["/// summary", "/// @returns {undefined}"],
        hasExistingDocLines: true
    };

    const recordedArgs: unknown[][] = [];

    const result = buildSyntheticDocComment(
        { type: "FunctionDeclaration" },
        ["/// existing"],
        { tabWidth: 4 },
        { leadingCommentLines: ["/// detail"] },
        (...args: unknown[]) => {
            recordedArgs.push(args);
            return syntheticResult;
        }
    );

    assert.deepEqual(recordedArgs[0], [
        { type: "FunctionDeclaration" },
        ["/// existing"],
        { tabWidth: 4 },
        { leadingCommentLines: ["/// detail"] }
    ]);

    const printed = prettierDoc.printer.printDocToString(result?.doc ?? "", {
        printWidth: 80,
        tabWidth: 4
    }).formatted;

    assert.equal(printed, "\n/// summary\n/// @returns {undefined}");
    assert.equal(result?.hasExistingDocLines, true);
    assert.deepEqual(result?.docLines, syntheticResult.docLines);

    const docOnlyResult = buildSyntheticDocCommentDoc(syntheticResult);
    const printedDocOnly = prettierDoc.printer.printDocToString(
        docOnlyResult?.doc ?? "",
        { printWidth: 80, tabWidth: 4 }
    ).formatted;

    assert.equal(printedDocOnly, "\n/// summary\n/// @returns {undefined}");
});

void test("buildSyntheticDocComment returns null when core declines to synthesize", () => {
    const recordedArgs: unknown[][] = [];

    const result = buildSyntheticDocComment(
        { type: "FunctionDeclaration" },
        [],
        {},
        {},
        (...args: unknown[]) => {
            recordedArgs.push(args);
            return null;
        }
    );

    assert.equal(result, null);
    assert.deepEqual(recordedArgs[0], [
        { type: "FunctionDeclaration" },
        [],
        {},
        {}
    ]);

    assert.equal(buildSyntheticDocCommentDoc(null), null);
});
