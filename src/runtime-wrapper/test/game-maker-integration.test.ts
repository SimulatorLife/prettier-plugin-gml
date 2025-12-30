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
};

function snapshotGlobals(): GlobalSnapshot {
    const globals = globalThis as GlobalSnapshot;
    return {
        JSON_game: globals.JSON_game,
        gml_Script_test: globals.gml_Script_test,
        gml_Object_oSpider_Step_0: globals.gml_Object_oSpider_Step_0
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
            StepNormalEvent: gml_Object_oSpider_Step_0
        };

        const jsonGame: JsonGameSnapshot = {
            ScriptNames: [],
            Scripts: [],
            GMObjects: [objectEntry]
        };

        const globals = globalThis as GlobalSnapshot;
        globals.JSON_game = jsonGame;
        globals.gml_Object_oSpider_Step_0 = gml_Object_oSpider_Step_0;

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
    } finally {
        restoreGlobals(snapshot);
    }
});
