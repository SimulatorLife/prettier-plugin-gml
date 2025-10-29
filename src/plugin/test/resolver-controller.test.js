import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createResolverController } from "../src/shared/resolver-controller.js";

describe("createResolverController", () => {
    it("returns defaults when no resolver is installed", () => {
        let defaultCalls = 0;
        const controller = createResolverController({
            defaultFactory() {
                defaultCalls += 1;
                return { marker: defaultCalls };
            }
        });

        const first = controller.resolve();
        const second = controller.resolve();

        assert.deepEqual(first, { marker: 2 });
        assert.deepEqual(second, { marker: 3 });
        assert.equal(defaultCalls, 3);
    });

    it("passes the previous value through the resolver pipeline", () => {
        const seen = [];
        const controller = createResolverController({
            defaultFactory: () => ({ version: "baseline" }),
            invoke(resolver, options, previous) {
                seen.push({ phase: "invoke", previous });
                return resolver(options, previous);
            },
            normalize(result, options, previous) {
                seen.push({ phase: "normalize", previous, result });
                return result;
            }
        });

        controller.set((options, previous) => ({
            version: `${previous.version}-${options?.suffix ?? "initial"}`
        }));

        seen.length = 0;

        const resolved = controller.resolve({ suffix: "next" });

        assert.deepEqual(resolved, { version: "baseline-initial-next" });
        assert.equal(seen.length, 2);
        assert.deepEqual(seen[0], {
            phase: "invoke",
            previous: { version: "baseline-initial" }
        });
        assert.deepEqual(seen[1], {
            phase: "normalize",
            previous: { version: "baseline-initial" },
            result: { version: "baseline-initial-next" }
        });
    });

    it("restores the default state after clearing the resolver", () => {
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
