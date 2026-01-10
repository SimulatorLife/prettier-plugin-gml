import assert from "node:assert/strict";
import test from "node:test";

import { RuntimeWrapper } from "../src/index.js";

type GlobalSnapshot = {
    make_colour_rgb?: (red: number, green: number, blue: number) => number;
    make_color_rgb?: (red: number, green: number, blue: number) => number;
};

function snapshotGlobals(): GlobalSnapshot {
    const globals = globalThis as GlobalSnapshot;
    return {
        make_colour_rgb: globals.make_colour_rgb,
        make_color_rgb: globals.make_color_rgb
    };
}

function restoreGlobals(snapshot: GlobalSnapshot): void {
    const globals = globalThis as GlobalSnapshot;

    if (snapshot.make_colour_rgb === undefined) {
        delete globals.make_colour_rgb;
    } else {
        globals.make_colour_rgb = snapshot.make_colour_rgb;
    }

    if (snapshot.make_color_rgb === undefined) {
        delete globals.make_color_rgb;
    } else {
        globals.make_color_rgb = snapshot.make_color_rgb;
    }
}

await test("builtin constants use make_colour_rgb when available", () => {
    const snapshot = snapshotGlobals();

    try {
        const globals = globalThis as GlobalSnapshot;
        globals.make_colour_rgb = (red, green, blue) => (red & 0xff) | ((green & 0xff) << 8) | ((blue & 0xff) << 16);

        const wrapper = RuntimeWrapper.createRuntimeWrapper();
        wrapper.applyPatch({
            kind: "script",
            id: "gml/script/color_test",
            js_body: "return c_red;"
        });

        const fn = wrapper.getScript("gml/script/color_test");
        assert.ok(fn);
        const result = fn(null, null, []) as number;
        assert.equal(result, 255);
    } finally {
        restoreGlobals(snapshot);
    }
});

await test("builtin constants use make_color_rgb when make_colour_rgb not available", () => {
    const snapshot = snapshotGlobals();

    try {
        const globals = globalThis as GlobalSnapshot;
        delete globals.make_colour_rgb;
        globals.make_color_rgb = (red, green, blue) => (red & 0xff) | ((green & 0xff) << 8) | ((blue & 0xff) << 16);

        const wrapper = RuntimeWrapper.createRuntimeWrapper();
        wrapper.applyPatch({
            kind: "script",
            id: "gml/script/color_test",
            js_body: "return c_blue;"
        });

        const fn = wrapper.getScript("gml/script/color_test");
        assert.ok(fn);
        const result = fn(null, null, []) as number;
        assert.equal(result, 16_711_680);
    } finally {
        restoreGlobals(snapshot);
    }
});

await test("builtin constants use fallback implementation when no color function available", () => {
    const snapshot = snapshotGlobals();

    try {
        const globals = globalThis as GlobalSnapshot;
        delete globals.make_colour_rgb;
        delete globals.make_color_rgb;

        const wrapper = RuntimeWrapper.createRuntimeWrapper();
        wrapper.applyPatch({
            kind: "script",
            id: "gml/script/color_test",
            js_body: "return c_green;"
        });

        const fn = wrapper.getScript("gml/script/color_test");
        assert.ok(fn);
        const result = fn(null, null, []) as number;
        assert.equal(result, 32_768);
    } finally {
        restoreGlobals(snapshot);
    }
});

await test("builtin constants prefer make_colour_rgb over make_color_rgb", () => {
    const snapshot = snapshotGlobals();

    try {
        const globals = globalThis as GlobalSnapshot;
        let britishCalled = false;
        let americanCalled = false;

        globals.make_colour_rgb = (red, green, blue) => {
            britishCalled = true;
            return (red & 0xff) | ((green & 0xff) << 8) | ((blue & 0xff) << 16);
        };

        globals.make_color_rgb = (red, green, blue) => {
            americanCalled = true;
            return (red & 0xff) | ((green & 0xff) << 8) | ((blue & 0xff) << 16);
        };

        const wrapper = RuntimeWrapper.createRuntimeWrapper();
        wrapper.applyPatch({
            kind: "script",
            id: "gml/script/color_test",
            js_body: "return c_white;"
        });

        const fn = wrapper.getScript("gml/script/color_test");
        assert.ok(fn);
        fn(null, null, []);

        assert.ok(britishCalled, "Should call make_colour_rgb");
        assert.ok(!americanCalled, "Should not call make_color_rgb when make_colour_rgb is available");
    } finally {
        restoreGlobals(snapshot);
    }
});

await test("builtin constants include keyboard constants", () => {
    const snapshot = snapshotGlobals();

    try {
        const wrapper = RuntimeWrapper.createRuntimeWrapper();
        wrapper.applyPatch({
            kind: "script",
            id: "gml/script/keyboard_test",
            js_body: "return vk_enter + vk_space + vk_escape;"
        });

        const fn = wrapper.getScript("gml/script/keyboard_test");
        assert.ok(fn);
        const result = fn(null, null, []) as number;
        assert.equal(result, 13 + 32 + 27);
    } finally {
        restoreGlobals(snapshot);
    }
});

await test("builtin constants include math constants", () => {
    const snapshot = snapshotGlobals();

    try {
        const wrapper = RuntimeWrapper.createRuntimeWrapper();
        wrapper.applyPatch({
            kind: "script",
            id: "gml/script/math_test",
            js_body: "return pi + pi2;"
        });

        const fn = wrapper.getScript("gml/script/math_test");
        assert.ok(fn);
        const result = fn(null, null, []) as number;
        const expected = Math.PI + Math.PI * 2;
        assert.ok(Math.abs(result - expected) < 1e-9);
    } finally {
        restoreGlobals(snapshot);
    }
});
