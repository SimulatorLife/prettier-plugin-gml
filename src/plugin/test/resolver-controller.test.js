import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createResolverController } from "../src/shared/resolver-controller.js";

describe("createResolverController", () => {
    it("returns defaults when no resolver is installed", () => {
        let defaultCalls = 0;
        const { resolution, registry } = createResolverController({
            defaultFactory() {
                defaultCalls += 1;
                return { marker: defaultCalls };
            }
        });

        const first = resolution.resolve();
        const second = resolution.resolve();

        assert.deepEqual(first, { marker: 2 });
        assert.deepEqual(second, { marker: 3 });
        assert.equal(defaultCalls, 3);
    });

    it("passes the previous value through the resolver pipeline", () => {
        const seen = [];
        const { resolution, registry } = createResolverController({
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

        registry.set((options, previous) => ({
            version: `${previous.version}-${options?.suffix ?? "initial"}`
        }));

        seen.length = 0;

        const resolved = resolution.resolve({ suffix: "next" });

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
        const { resolution, registry } = createResolverController({
            defaultFactory: () => ({ value: "default" })
        });

        registry.set(() => ({ value: "custom" }));
        assert.deepEqual(resolution.resolve(), { value: "custom" });

        const restored = registry.restore();
        assert.deepEqual(restored, { value: "default" });
        assert.deepEqual(resolution.resolve(), { value: "default" });
    });
});
