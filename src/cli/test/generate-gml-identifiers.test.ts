import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import vm from "node:vm";

import { __test__ } from "../src/commands/generate-gml-identifiers.js";

const {
    parseArrayLiteral,
    collectManualArrayIdentifiers,
    assertManualIdentifierArray,
    extractDeprecatedReplacementFromManualHtml,
    parseObsoleteIdentifierTableEntries
} = __test__;

const SAMPLE_SOURCE = `
const KEYWORDS = [
    "alpha",
    "beta"
];
`;

void describe("generate-gml-identifiers", () => {
    void it("normalizes VM evaluation failures", () => {
        const thrown = Object.create(null);
        const restoreVm = mock.method(vm, "runInNewContext", () => {
            throw thrown;
        });

        try {
            assert.throws(
                () => parseArrayLiteral(SAMPLE_SOURCE, "KEYWORDS"),
                (error) => {
                    return (
                        error instanceof Error &&
                        error.message === "Failed to evaluate array literal for KEYWORDS: Unknown error" &&
                        error.cause === thrown
                    );
                }
            );
        } finally {
            restoreVm.mock.restore();
        }
    });

    void it("rejects manual identifier arrays that do not evaluate to arrays", () => {
        const identifierMap = new Map();

        assert.throws(
            () =>
                collectManualArrayIdentifiers(
                    identifierMap,
                    null,
                    { type: "keyword", source: "manual:gml.js:KEYWORDS" },
                    { identifier: "KEYWORDS" }
                ),
            (error) => {
                return (
                    error instanceof TypeError &&
                    /Manual identifier array 'manual:gml\.js:KEYWORDS' must evaluate to an array of strings\./.test(
                        error.message
                    ) &&
                    /Received null/.test(error.message)
                );
            }
        );

        assert.equal(identifierMap.size, 0);
    });

    void it("rejects manual identifier arrays containing non-string entries", () => {
        const identifierMap = new Map();

        assert.throws(
            () =>
                collectManualArrayIdentifiers(
                    identifierMap,
                    ["alpha", 5],
                    { type: "keyword", source: "manual:gml.js:KEYWORDS" },
                    { identifier: "KEYWORDS" }
                ),
            (error) => {
                return (
                    error instanceof TypeError &&
                    /Manual identifier array 'manual:gml\.js:KEYWORDS' must contain only strings\./.test(
                        error.message
                    ) &&
                    /Entry at index 1 was a number/.test(error.message)
                );
            }
        );

        assert.equal(identifierMap.size, 0);
    });

    void it("exposes assertManualIdentifierArray for tests", () => {
        const values = assertManualIdentifierArray(["alpha"], {
            identifier: "KEYWORDS",
            source: "manual:gml.js:KEYWORDS"
        });

        assert.deepEqual(values, ["alpha"]);
    });

    void it("extracts direct replacement metadata from deprecated manual pages", () => {
        const replacement = extractDeprecatedReplacementFromManualHtml(`
            <p class="note"><b>WARNING!</b> This function is deprecated (and replaced by
            <span class="inline"><a href="array_length.htm">array_length()</a></span>).</p>
        `);

        assert.deepEqual(replacement, {
            replacement: "array_length",
            replacementKind: "direct-rename"
        });
    });

    void it("parses obsolete identifier tables into normalized deprecated entries", () => {
        const entries = parseObsoleteIdentifierTableEntries(`
            <p><a class="dropspot" data-target="drop-down" href="#">Backgrounds</a></p>
            <div class="droptext" data-targetname="drop-down">
              <p class="dropspot">the following functions are obsolete:</p>
              <table>
                <tbody>
                  <tr>
                    <td>draw_background</td>
                    <td>room_set_<br />background_colour</td>
                  </tr>
                </tbody>
              </table>
              <p class="dropspot">background variables are no longer required:</p>
              <table>
                <tbody>
                  <tr>
                    <td>background_<br />index[0..7]</td>
                  </tr>
                </tbody>
              </table>
            </div>
        `);

        assert.deepEqual(entries, [
            {
                name: "draw_background",
                type: "function",
                legacyCategory: "Backgrounds",
                legacyUsage: "call"
            },
            {
                name: "room_set_background_colour",
                type: "function",
                legacyCategory: "Backgrounds",
                legacyUsage: "call"
            },
            {
                name: "background_index",
                type: "variable",
                legacyCategory: "Backgrounds",
                legacyUsage: "indexed-identifier"
            }
        ]);
    });
});
