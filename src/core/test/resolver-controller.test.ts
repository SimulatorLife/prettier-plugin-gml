import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Core } from "@gml-modules/core";

const createResolverController = Core.createResolverController;

void describe("createResolverController", () => {
    void it("returns defaults when no resolver is installed", () => {
        const controller = createResolverController({
            defaultFactory() {
                return { value: "default" };
            }
        });

        const first = controller.resolve();
        const second = controller.resolve();

        assert.deepEqual(first, { value: "default" });
        assert.strictEqual(first, second);
    });

    void it("caches the default value to avoid repeated factory calls", () => {
        let defaultCalls = 0;
        const controller = createResolverController({
            defaultFactory() {
                defaultCalls += 1;
                return { marker: defaultCalls };
            }
        });

        const first = controller.resolve();
        const second = controller.resolve();

        assert.deepEqual(first, { marker: 1 });
        assert.strictEqual(first, second);
        assert.equal(defaultCalls, 1);
    });

    void it("applies normalization to resolver results", () => {
        const controller = createResolverController({
            defaultFactory: () => ({ value: "default" }),
            normalize(result: any) {
                return { value: `normalized:${result.value}` };
            }
        });

        controller.set(() => ({ value: "custom" }));

        const resolved = controller.resolve();

        assert.deepEqual(resolved, { value: "normalized:custom" });
    });

    void it("restores the default state after clearing the resolver", () => {
        const controller = createResolverController({
            defaultFactory: () => ({ value: "default" })
        });

        controller.set(() => ({ value: "custom" }));
        assert.deepEqual(controller.resolve(), { value: "custom" });

        const restored = controller.restore();
        assert.deepEqual(restored, { value: "default" });
        assert.deepEqual(controller.resolve(), { value: "default" });
    });
});
