import assert from "node:assert/strict";
import test from "node:test";

import { Transpiler } from "../index.js";

type TranspilerInstance = InstanceType<typeof Transpiler.GmlTranspiler>;
type TranspileEventArgs = Parameters<TranspilerInstance["transpileEvent"]>[0];

void test("transpileEvent returns an event patch for simple code", () => {
    const transpiler = new Transpiler.GmlTranspiler();
    const patch = transpiler.transpileEvent({
        sourceText: "x = 1;",
        symbolId: "gml/event/obj_player/Step_0"
    });

    assert.equal(patch.kind, "event");
    assert.equal(patch.id, "gml/event/obj_player/Step_0");
    assert.ok(patch.js_body, "Should have a js_body");
    assert.ok(patch.version > 0, "Should have a version timestamp");
});

void test("transpileEvent sets default this_name to self", () => {
    const transpiler = new Transpiler.GmlTranspiler();
    const patch = transpiler.transpileEvent({
        sourceText: "x = 1;",
        symbolId: "gml/event/obj_player/Step_0"
    });

    assert.equal(patch.this_name, "self");
});

void test("transpileEvent respects custom thisName", () => {
    const transpiler = new Transpiler.GmlTranspiler();
    const patch = transpiler.transpileEvent({
        sourceText: "x = 1;",
        symbolId: "gml/event/obj_player/Step_0",
        thisName: "instance"
    });

    assert.equal(patch.this_name, "instance");
});

void test("transpileEvent includes sourceText in result", () => {
    const transpiler = new Transpiler.GmlTranspiler();
    const source = "x += speed;";
    const patch = transpiler.transpileEvent({
        sourceText: source,
        symbolId: "gml/event/obj_player/Step_0"
    });

    assert.equal(patch.sourceText, source);
});

void test("transpileEvent emits var-declared identifiers as bare locals", () => {
    const transpiler = new Transpiler.GmlTranspiler();
    const patch = transpiler.transpileEvent({
        sourceText: "var speed = 5; x += speed;",
        symbolId: "gml/event/obj_player/Step_0"
    });

    // speed is declared with var → local (bare identifier)
    assert.ok(patch.js_body.includes("speed"), "Should include speed variable");
    // Ensure speed is NOT prefixed with self.
    assert.equal(patch.js_body.includes("self.speed"), false, "var-declared speed should NOT be self.speed");
});

void test("transpileEvent emits undeclared identifiers as self fields", () => {
    const transpiler = new Transpiler.GmlTranspiler();
    const patch = transpiler.transpileEvent({
        sourceText: "x += 1;",
        symbolId: "gml/event/obj_player/Step_0"
    });

    // x is not declared with var → instance field → self.x
    assert.ok(patch.js_body.includes("self.x"), "Undeclared x should be emitted as self.x");
});

void test("transpileEvent correctly distinguishes locals from instance fields", () => {
    const transpiler = new Transpiler.GmlTranspiler();
    const patch = transpiler.transpileEvent({
        sourceText: "var speed = 5; x += speed; y += speed;",
        symbolId: "gml/event/obj_player/Step_0"
    });

    // speed → local (var), x and y → self_field
    assert.ok(patch.js_body.includes("self.x"), "x should be self.x");
    assert.ok(patch.js_body.includes("self.y"), "y should be self.y");
    assert.equal(patch.js_body.includes("self.speed"), false, "speed should NOT be self.speed");
});

void test("transpileEvent emits built-in function calls as-is", () => {
    const transpiler = new Transpiler.GmlTranspiler();
    const patch = transpiler.transpileEvent({
        sourceText: "var len = point_distance(x, y, 0, 0);",
        symbolId: "gml/event/obj_player/Step_0"
    });

    // point_distance is a GML built-in → should not be prefixed with self.
    assert.ok(patch.js_body.includes("point_distance"), "Should include point_distance");
    assert.equal(patch.js_body.includes("self.point_distance"), false, "Built-in should not be self.point_distance");
});

void test("transpileEvent handles complex event body with control flow", () => {
    const transpiler = new Transpiler.GmlTranspiler();
    const patch = transpiler.transpileEvent({
        sourceText: `
            var spd = move_speed;
            if (alarm[0] > 0) {
                x += lengthdir_x(spd, direction);
                y += lengthdir_y(spd, direction);
            }
        `,
        symbolId: "gml/event/obj_player/Step_0"
    });

    // spd is declared with var → local
    assert.equal(patch.js_body.includes("self.spd"), false, "spd should NOT be self.spd");
    // move_speed is an instance field
    assert.ok(patch.js_body.includes("self.move_speed"), "move_speed should be self.move_speed");
    // x, y, direction, alarm are instance fields
    assert.ok(patch.js_body.includes("self.x"), "x should be self.x");
    assert.ok(patch.js_body.includes("self.y"), "y should be self.y");
    assert.ok(patch.js_body.includes("self.direction"), "direction should be self.direction");
    // lengthdir_x and lengthdir_y are builtins
    assert.equal(patch.js_body.includes("self.lengthdir_x"), false, "lengthdir_x should not be self.lengthdir_x");
    assert.equal(patch.js_body.includes("self.lengthdir_y"), false, "lengthdir_y should not be self.lengthdir_y");
});

void test("transpileEvent vars declared inside nested blocks are still locals", () => {
    const transpiler = new Transpiler.GmlTranspiler();
    const patch = transpiler.transpileEvent({
        sourceText: `
            if (check) {
                var found = true;
            }
            something = found;
        `,
        symbolId: "gml/event/obj/Step_0"
    });

    // In GML, var is function-scoped; found declared inside if block is still local
    assert.equal(patch.js_body.includes("self.found"), false, "found should NOT be self.found (var-declared)");
    // check and something are not declared → self_field
    assert.ok(patch.js_body.includes("self.check"), "check should be self.check");
    assert.ok(patch.js_body.includes("self.something"), "something should be self.something");
});

void test("transpileEvent includes source path in metadata when provided", () => {
    const transpiler = new Transpiler.GmlTranspiler();
    const patch = transpiler.transpileEvent({
        sourceText: "x = 1;",
        symbolId: "gml/event/obj_player/Step_0",
        sourcePath: "objects/obj_player/Step_0.gml"
    });

    assert.equal(patch.metadata?.sourcePath, "objects/obj_player/Step_0.gml");
});

void test("transpileEvent validates request object", () => {
    const transpiler = new Transpiler.GmlTranspiler();

    assert.throws(() => transpiler.transpileEvent(null as unknown as TranspileEventArgs), { name: "TypeError" });
});

void test("transpileEvent validates sourceText field", () => {
    const transpiler = new Transpiler.GmlTranspiler();

    assert.throws(() => transpiler.transpileEvent({ sourceText: "", symbolId: "gml/event/obj/Step_0" }), {
        name: "TypeError"
    });
});

void test("transpileEvent validates symbolId field", () => {
    const transpiler = new Transpiler.GmlTranspiler();

    assert.throws(() => transpiler.transpileEvent({ sourceText: "x = 1;", symbolId: "" }), { name: "TypeError" });
});

void test("transpileEvent rejects empty sourcePath", () => {
    const transpiler = new Transpiler.GmlTranspiler();

    assert.throws(
        () =>
            transpiler.transpileEvent({
                sourceText: "x = 1;",
                symbolId: "gml/event/obj/Step_0",
                sourcePath: ""
            }),
        { name: "TypeError" }
    );
});

void test("transpileEvent handles parse errors gracefully", () => {
    const transpiler = new Transpiler.GmlTranspiler();

    assert.throws(
        () =>
            transpiler.transpileEvent({
                sourceText: "invalid syntax %%%%",
                symbolId: "gml/event/obj/Step_0"
            }),
        { message: /Failed to transpile event/ }
    );
});

void test("transpileEvent does not emit self prefix on global.x access", () => {
    const transpiler = new Transpiler.GmlTranspiler();
    const patch = transpiler.transpileEvent({
        sourceText: "global.score += 1;",
        symbolId: "gml/event/obj_player/Step_0"
    });

    // global.score is an explicit member access, not a bare identifier
    assert.ok(patch.js_body.includes("global"), "Should include global");
    assert.ok(patch.js_body.includes("score"), "Should include score");
});
