import assert from "node:assert/strict";
import test from "node:test";

import { RuntimeWrapper } from "../index.js";

type JsonGameSnapshot = {
    ScriptNames: Array<string>;
    Scripts: Array<(...args: Array<unknown>) => unknown>;
    GMObjects: Array<Record<string, unknown>>;
};

type GlobalSnapshot = {
    JSON_game?: JsonGameSnapshot;
    gml_Script_test?: (...args: Array<unknown>) => unknown;
    gml_Object_oSpider_Step_0?: (...args: Array<unknown>) => unknown;
    g_pBuiltIn?: Record<string, unknown>;
    make_colour_rgb?: (red: number, green: number, blue: number) => number;
    vk_anykey?: number;
    _cx?: { _dx?: Record<string, unknown> };
};

function snapshotGlobals(): GlobalSnapshot {
    const globals = globalThis as GlobalSnapshot;
    return {
        JSON_game: globals.JSON_game,
        gml_Script_test: globals.gml_Script_test,
        gml_Object_oSpider_Step_0: globals.gml_Object_oSpider_Step_0,
        g_pBuiltIn: globals.g_pBuiltIn,
        make_colour_rgb: globals.make_colour_rgb,
        vk_anykey: globals.vk_anykey,
        _cx: globals._cx
    };
}

function restoreGlobals(snapshot: GlobalSnapshot): void {
    const globals = globalThis as GlobalSnapshot;

    if (snapshot.JSON_game === undefined) {
        delete globals.JSON_game;
    } else {
        globals.JSON_game = snapshot.JSON_game;
    }

    if (snapshot.gml_Script_test === undefined) {
        delete globals.gml_Script_test;
    } else {
        globals.gml_Script_test = snapshot.gml_Script_test;
    }

    if (snapshot.gml_Object_oSpider_Step_0 === undefined) {
        delete globals.gml_Object_oSpider_Step_0;
    } else {
        globals.gml_Object_oSpider_Step_0 = snapshot.gml_Object_oSpider_Step_0;
    }

    if (snapshot.g_pBuiltIn === undefined) {
        delete globals.g_pBuiltIn;
    } else {
        globals.g_pBuiltIn = snapshot.g_pBuiltIn;
    }

    if (snapshot.make_colour_rgb === undefined) {
        delete globals.make_colour_rgb;
    } else {
        globals.make_colour_rgb = snapshot.make_colour_rgb;
    }

    if (snapshot.vk_anykey === undefined) {
        delete globals.vk_anykey;
    } else {
        globals.vk_anykey = snapshot.vk_anykey;
    }

    if (snapshot._cx === undefined) {
        delete globals._cx;
    } else {
        globals._cx = snapshot._cx;
    }
}

await test("applies script patches to GameMaker script registry", () => {
    const snapshot = snapshotGlobals();

    try {
        function gml_Script_test() {
            return "original";
        }

        const jsonGame: JsonGameSnapshot = {
            ScriptNames: ["gml_Script_test"],
            Scripts: [gml_Script_test],
            GMObjects: []
        };

        const globals = globalThis as GlobalSnapshot;
        globals.JSON_game = jsonGame;
        globals.gml_Script_test = gml_Script_test;

        const wrapper = RuntimeWrapper.createRuntimeWrapper();
        wrapper.applyPatch({
            kind: "script",
            id: "gml/script/test",
            runtimeId: "gml_Script_test",
            js_body: "return 42;"
        });

        const updatedFn = globals.gml_Script_test;
        assert.notEqual(
            updatedFn,
            gml_Script_test,
            "Global script reference should be replaced"
        );
        assert.equal(
            jsonGame.Scripts[0],
            updatedFn,
            "JSON_game script table should be updated"
        );
    } finally {
        restoreGlobals(snapshot);
    }
});

await test("applies object event patches to GameMaker object tables", () => {
    const snapshot = snapshotGlobals();

    try {
        function gml_Object_oSpider_Step_0() {
            return "original";
        }

        const objectEntry = {
            pName: "oSpider",
            StepNormalEvent: gml_Object_oSpider_Step_0
        };
        const instanceEntry = {
            _kx: { pName: "oSpider" }
        };

        const jsonGame: JsonGameSnapshot = {
            ScriptNames: [],
            Scripts: [],
            GMObjects: [objectEntry]
        };

        const globals = globalThis as GlobalSnapshot;
        globals.JSON_game = jsonGame;
        globals.gml_Object_oSpider_Step_0 = gml_Object_oSpider_Step_0;
        globals._cx = {
            _dx: {
                "100000": instanceEntry
            }
        };

        const wrapper = RuntimeWrapper.createRuntimeWrapper();
        wrapper.applyPatch({
            kind: "script",
            id: "gml/script/Step_0",
            runtimeId: "gml_Object_oSpider_Step_0",
            js_body: "return 99;"
        });

        const updatedFn = globals.gml_Object_oSpider_Step_0;
        assert.notEqual(
            updatedFn,
            gml_Object_oSpider_Step_0,
            "Global event reference should be replaced"
        );
        assert.equal(
            objectEntry.StepNormalEvent,
            updatedFn,
            "GMObjects entry should be updated"
        );
        assert.ok(
            "StepNormalEvent" in instanceEntry,
            "Instance event handler should be assigned"
        );
        assert.equal(
            instanceEntry.StepNormalEvent,
            updatedFn,
            "Instance event handler should be updated"
        );
    } finally {
        restoreGlobals(snapshot);
    }
});

await test("script patches resolve builtin constants and getters", () => {
    const snapshot = snapshotGlobals();

    try {
        const globals = globalThis as GlobalSnapshot;
        globals.make_colour_rgb = (red, green, blue) =>
            (red & 0xff) | ((green & 0xff) << 8) | ((blue & 0xff) << 16);
        globals.g_pBuiltIn = {
            get_mouse_x: () => 10,
            get_current_time: () => 20
        };
        globals.vk_anykey = 42;

        const wrapper = RuntimeWrapper.createRuntimeWrapper();
        wrapper.applyPatch({
            kind: "script",
            id: "gml/script/constants",
            js_body: "return vk_anykey + mouse_x + current_time + c_blue + pi;"
        });

        const fn = wrapper.getScript("gml/script/constants");
        assert.ok(fn);
        const result = fn(null, null, []) as number;
        const expected = 42 + 10 + 20 + 16711680 + Math.PI;
        assert.ok(Math.abs(result - expected) < 1e-9);
    } finally {
        restoreGlobals(snapshot);
    }
});
