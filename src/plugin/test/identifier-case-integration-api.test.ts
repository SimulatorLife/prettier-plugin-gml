import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { configureIdentifierCaseIntegration, Plugin } from "../index.js";

void describe("identifier case integration API", () => {
    void it("accepts object configuration without mutating plugin format behavior", async () => {
        configureIdentifierCaseIntegration({
            runtime: {
                createScopeTracker() {
                    return {};
                }
            },
            identifierCaseOptions: {},
            printerServices: {}
        });

        const formatted = await Plugin.format("function test() {\n    return 1;\n}\n", {
            filepath: "script.gml"
        });

        assert.match(formatted, /function test\(\)/);
    });

    void it("rejects non-object configuration", () => {
        assert.throws(() => {
            configureIdentifierCaseIntegration(null as unknown as Record<string, unknown>);
        }, /configuration to be an object/);
    });
});
