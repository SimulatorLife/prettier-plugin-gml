// Minimal placeholder for the HTML5 runtime hot wrapper.
export function createRuntimeWrapper({ registry } = {}) {
    const state = {
        registry: registry ?? {
            version: 0,
            scripts: Object.create(null),
            events: Object.create(null),
            closures: Object.create(null)
        }
    };

    function applyPatch(patch) {
        if (!patch || typeof patch !== "object") {
            throw new TypeError("applyPatch expects a patch object");
        }

        throw new Error("applyPatch is not implemented yet");
    }

    return {
        state,
        applyPatch
    };
}
