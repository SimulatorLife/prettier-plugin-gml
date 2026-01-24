import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    DEFAULT_STATUS_HEALTH_POLICY_CONFIG,
    evaluateReadiness,
    evaluateTranspilationHealth
} from "../../../src/modules/status/status-health-policy.js";

void describe("status health policy", () => {
    void describe("evaluateTranspilationHealth", () => {
        void it("returns pass when there are no errors", () => {
            const decision = evaluateTranspilationHealth({ patchCount: 0, errorCount: 0 });

            assert.deepStrictEqual(decision, { status: "pass", patchCount: 0, errorCount: 0 });
        });

        void it("returns pass when patch count exceeds error count", () => {
            const decision = evaluateTranspilationHealth({ patchCount: 3, errorCount: 1 });

            assert.deepStrictEqual(decision, { status: "pass", patchCount: 3, errorCount: 1 });
        });

        void it("returns warn when errors exceed or match patch count", () => {
            const decision = evaluateTranspilationHealth({ patchCount: 2, errorCount: 2 });

            assert.deepStrictEqual(decision, { status: "warn", patchCount: 2, errorCount: 2 });
        });
    });

    void describe("evaluateReadiness", () => {
        void it("returns ready when there are no errors", () => {
            const decision = evaluateReadiness({ patchCount: 0, errorCount: 0 }, DEFAULT_STATUS_HEALTH_POLICY_CONFIG);

            assert.deepStrictEqual(decision, { isReady: true });
        });

        void it("returns ready when patch count clears the configured ratio", () => {
            const decision = evaluateReadiness({ patchCount: 3, errorCount: 1 }, DEFAULT_STATUS_HEALTH_POLICY_CONFIG);

            assert.deepStrictEqual(decision, { isReady: true });
        });

        void it("returns not ready when patch count fails the configured ratio", () => {
            const decision = evaluateReadiness({ patchCount: 2, errorCount: 1 }, DEFAULT_STATUS_HEALTH_POLICY_CONFIG);

            assert.deepStrictEqual(decision, { isReady: false });
        });
    });
});
