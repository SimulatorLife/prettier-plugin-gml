/**
 * Integration tests for GmlTranspiler.transpileEvent.
 *
 * These tests verify that event-body transpilation produces an EventPatch
 * with correct `self.` prefixes for instance-variable access, while leaving
 * built-in function calls, GML constants/literals, local `var` declarations,
 * and function parameters as bare identifiers.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Parser } from "@gml-modules/parser";

import { Transpiler } from "../index.js";
import type { TranspileEventRequest } from "../src/api/gml-transpiler.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function transpileEvent(sourceText: string, symbolId = "gml/event/obj_test/Step_0"): string {
    const transpiler = new Transpiler.GmlTranspiler();
    return transpiler.transpileEvent({ sourceText, symbolId }).js_body;
}

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

void describe("GmlTranspiler.transpileEvent – input validation", () => {
    void it("throws when request object is missing", () => {
        const transpiler = new Transpiler.GmlTranspiler();
        assert.throws(() => transpiler.transpileEvent(null as unknown as TranspileEventRequest), {
            name: "TypeError"
        });
    });

    void it("throws when sourceText is missing", () => {
        const transpiler = new Transpiler.GmlTranspiler();
        assert.throws(
            () =>
                transpiler.transpileEvent({
                    symbolId: "gml/event/obj/Create_0"
                } as unknown as TranspileEventRequest),
            { name: "TypeError" }
        );
    });

    void it("throws when symbolId is missing", () => {
        const transpiler = new Transpiler.GmlTranspiler();
        assert.throws(
            () =>
                transpiler.transpileEvent({
                    sourceText: "x = 1;"
                } as unknown as TranspileEventRequest),
            { name: "TypeError" }
        );
    });

    void it("throws when sourcePath is provided as an empty string", () => {
        const transpiler = new Transpiler.GmlTranspiler();
        assert.throws(
            () =>
                transpiler.transpileEvent({
                    sourceText: "x = 1;",
                    symbolId: "gml/event/obj/Create_0",
                    sourcePath: ""
                }),
            { name: "TypeError" }
        );
    });
});

// ---------------------------------------------------------------------------
// Patch structure
// ---------------------------------------------------------------------------

void describe("GmlTranspiler.transpileEvent – patch structure", () => {
    void it("returns a patch with kind 'event'", () => {
        const transpiler = new Transpiler.GmlTranspiler();
        const patch = transpiler.transpileEvent({ sourceText: "x = 1;", symbolId: "gml/event/obj/Step_0" });
        assert.equal(patch.kind, "event");
    });

    void it("patch id matches symbolId", () => {
        const transpiler = new Transpiler.GmlTranspiler();
        const patch = transpiler.transpileEvent({
            sourceText: "x = 1;",
            symbolId: "gml/event/obj_player/Create_0"
        });
        assert.equal(patch.id, "gml/event/obj_player/Create_0");
    });

    void it("patch includes sourceText", () => {
        const transpiler = new Transpiler.GmlTranspiler();
        const src = "x += 1;";
        const patch = transpiler.transpileEvent({ sourceText: src, symbolId: "gml/event/obj/Step_0" });
        assert.equal(patch.sourceText, src);
    });

    void it("patch includes a numeric version", () => {
        const transpiler = new Transpiler.GmlTranspiler();
        const patch = transpiler.transpileEvent({ sourceText: "x = 1;", symbolId: "gml/event/obj/Step_0" });
        assert.ok(typeof patch.version === "number" && patch.version > 0);
    });

    void it("patch includes metadata with timestamp", () => {
        const transpiler = new Transpiler.GmlTranspiler();
        const patch = transpiler.transpileEvent({ sourceText: "x = 1;", symbolId: "gml/event/obj/Step_0" });
        assert.ok(patch.metadata?.timestamp !== undefined);
    });

    void it("patch includes sourcePath in metadata when provided", () => {
        const transpiler = new Transpiler.GmlTranspiler();
        const patch = transpiler.transpileEvent({
            sourceText: "x = 1;",
            symbolId: "gml/event/obj/Step_0",
            sourcePath: "objects/obj_player/Step_0.gml"
        });
        assert.equal(patch.metadata?.sourcePath, "objects/obj_player/Step_0.gml");
    });

    void it("accepts a pre-parsed AST and produces identical js_body", () => {
        const src = "x += speed;";
        const ast = new Parser.GMLParser(src, {}).parse();
        const transpiler = new Transpiler.GmlTranspiler();

        const withAst = transpiler.transpileEvent({ sourceText: src, symbolId: "gml/event/obj/Step_0", ast });
        const withoutAst = transpiler.transpileEvent({ sourceText: src, symbolId: "gml/event/obj/Step_0" });

        assert.equal(withAst.js_body, withoutAst.js_body);
    });

    void it("throws a descriptive error for invalid GML", () => {
        const transpiler = new Transpiler.GmlTranspiler();
        assert.throws(
            () => transpiler.transpileEvent({ sourceText: "invalid %%%%", symbolId: "gml/event/obj/Step_0" }),
            { message: /Failed to transpile event/ }
        );
    });
});

// ---------------------------------------------------------------------------
// Self-prefix behaviour: instance variables
// ---------------------------------------------------------------------------

void describe("GmlTranspiler.transpileEvent – self. prefix for instance variables", () => {
    void it("prefixes undeclared identifier with self.", () => {
        const js = transpileEvent("hp = 100;");
        assert.ok(js.includes("self.hp"), `Expected self.hp in: ${js}`);
    });

    void it("prefixes built-in instance variable x with self.", () => {
        const js = transpileEvent("x += 1;");
        assert.ok(js.includes("self.x"), `Expected self.x in: ${js}`);
    });

    void it("prefixes built-in instance variable y with self.", () => {
        const js = transpileEvent("y -= 2;");
        assert.ok(js.includes("self.y"), `Expected self.y in: ${js}`);
    });

    void it("prefixes built-in instance variable speed with self.", () => {
        const js = transpileEvent("speed = 5;");
        assert.ok(js.includes("self.speed"), `Expected self.speed in: ${js}`);
    });

    void it("prefixes user-defined instance variable on both sides of assignment", () => {
        const js = transpileEvent("score = score + 10;");
        // The right-hand 'score' reference is also an instance variable
        assert.ok(js.includes("self.score"), `Expected self.score in: ${js}`);
    });

    void it("multiple instance variable accesses all get self.", () => {
        const js = transpileEvent("x += hspeed;\ny += vspeed;");
        assert.ok(js.includes("self.x"), `Expected self.x in: ${js}`);
        assert.ok(js.includes("self.hspeed"), `Expected self.hspeed in: ${js}`);
        assert.ok(js.includes("self.y"), `Expected self.y in: ${js}`);
        assert.ok(js.includes("self.vspeed"), `Expected self.vspeed in: ${js}`);
    });
});

// ---------------------------------------------------------------------------
// Self-prefix behaviour: identifiers that should NOT be prefixed
// ---------------------------------------------------------------------------

void describe("GmlTranspiler.transpileEvent – no self. prefix for constants, literals, builtins", () => {
    void it("does not prefix GML literal vk_left", () => {
        const js = transpileEvent("if (keyboard_check(vk_left)) { x -= 5; }");
        assert.ok(!js.includes("self.vk_left"), `Unexpected self.vk_left in: ${js}`);
        assert.ok(js.includes("vk_left"), `Expected bare vk_left in: ${js}`);
    });

    void it("does not prefix GML literal noone", () => {
        const js = transpileEvent("target = noone;");
        assert.ok(!js.includes("self.noone"), `Unexpected self.noone in: ${js}`);
    });

    void it("does not prefix built-in function keyboard_check", () => {
        const js = transpileEvent("keyboard_check(vk_space);");
        assert.ok(!js.includes("self.keyboard_check"), `Unexpected self.keyboard_check in: ${js}`);
    });

    void it("does not prefix built-in function abs", () => {
        const js = transpileEvent("result = abs(x);");
        // abs is a builtin, x is an instance variable
        assert.ok(!js.includes("self.abs"), `Unexpected self.abs in: ${js}`);
        assert.ok(js.includes("self.x"), `Expected self.x in: ${js}`);
    });

    void it("does not prefix built-in function instance_destroy", () => {
        const js = transpileEvent("instance_destroy();");
        assert.ok(!js.includes("self.instance_destroy"), `Unexpected self.instance_destroy in: ${js}`);
        assert.ok(js.includes("instance_destroy()"), `Expected instance_destroy() in: ${js}`);
    });
});

// ---------------------------------------------------------------------------
// Self-prefix behaviour: var-declared locals and parameters
// ---------------------------------------------------------------------------

void describe("GmlTranspiler.transpileEvent – var-declared locals are not prefixed", () => {
    void it("var-declared name is not prefixed", () => {
        const js = transpileEvent("var temp = 5; x = temp;");
        assert.ok(!js.includes("self.temp"), `Unexpected self.temp in: ${js}`);
        assert.ok(js.includes("self.x"), `Expected self.x in: ${js}`);
    });

    void it("multiple var declarations are not prefixed", () => {
        const js = transpileEvent("var a = 1, b = 2; x = a + b;");
        assert.ok(!js.includes("self.a"), `Unexpected self.a in: ${js}`);
        assert.ok(!js.includes("self.b"), `Unexpected self.b in: ${js}`);
        assert.ok(js.includes("self.x"), `Expected self.x in: ${js}`);
    });

    void it("var-declared name used in control flow is not prefixed", () => {
        const js = transpileEvent("var i = 0; for (var j = 0; j < 10; j += 1) { i += j; } x = i;");
        assert.ok(!js.includes("self.i"), `Unexpected self.i in: ${js}`);
        assert.ok(!js.includes("self.j"), `Unexpected self.j in: ${js}`);
        assert.ok(js.includes("self.x"), `Expected self.x in: ${js}`);
    });
});

// ---------------------------------------------------------------------------
// Nested functions inside event code
// ---------------------------------------------------------------------------

void describe("GmlTranspiler.transpileEvent – nested functions", () => {
    void it("function parameters in nested functions are not prefixed", () => {
        const js = transpileEvent("function helper(a, b) { return a + b; } x = helper(1, 2);");
        assert.ok(!js.includes("self.a"), `Unexpected self.a in: ${js}`);
        assert.ok(!js.includes("self.b"), `Unexpected self.b in: ${js}`);
    });

    void it("function name in nested function is not prefixed when called", () => {
        const js = transpileEvent("function helper() { return 1; } x = helper();");
        assert.ok(!js.includes("self.helper"), `Unexpected self.helper in: ${js}`);
    });

    void it("instance variables accessed inside nested function still get self.", () => {
        // Inside a nested function, undeclared identifiers are still instance vars
        const js = transpileEvent("function update() { x += speed; }");
        // x and speed inside update() should become self.x and self.speed
        assert.ok(js.includes("self.x"), `Expected self.x in: ${js}`);
        assert.ok(js.includes("self.speed"), `Expected self.speed in: ${js}`);
    });
});

// ---------------------------------------------------------------------------
// Full event scenarios
// ---------------------------------------------------------------------------

void describe("GmlTranspiler.transpileEvent – realistic event scenarios", () => {
    void it("Step event with movement logic", () => {
        const src = `
x += hspeed;
y += vspeed;
if (x < 0) { x = 0; hspeed = 0; }
if (y < 0) { y = 0; vspeed = 0; }
`.trim();
        const js = transpileEvent(src);
        assert.ok(js.includes("self.x"), `Expected self.x in: ${js}`);
        assert.ok(js.includes("self.hspeed"), `Expected self.hspeed in: ${js}`);
        assert.ok(js.includes("self.y"), `Expected self.y in: ${js}`);
        assert.ok(js.includes("self.vspeed"), `Expected self.vspeed in: ${js}`);
    });

    void it("Create event initializing instance variables", () => {
        const src = `
hp = 100;
speed = 0;
score = 0;
alive = true;
`.trim();
        const js = transpileEvent(src);
        assert.ok(js.includes("self.hp"), `Expected self.hp in: ${js}`);
        assert.ok(js.includes("self.speed"), `Expected self.speed in: ${js}`);
        assert.ok(js.includes("self.score"), `Expected self.score in: ${js}`);
        assert.ok(js.includes("self.alive"), `Expected self.alive in: ${js}`);
    });

    void it("event with var locals and instance vars mixed", () => {
        const src = `
var dx = target_x - x;
var dy = target_y - y;
var dist = sqrt(dx * dx + dy * dy);
if (dist > 0) {
    hspeed = (dx / dist) * speed;
    vspeed = (dy / dist) * speed;
}
`.trim();
        const js = transpileEvent(src);
        // Local vars should not be prefixed
        assert.ok(!js.includes("self.dx"), `Unexpected self.dx in: ${js}`);
        assert.ok(!js.includes("self.dy"), `Unexpected self.dy in: ${js}`);
        assert.ok(!js.includes("self.dist"), `Unexpected self.dist in: ${js}`);
        // Instance vars should be prefixed
        assert.ok(js.includes("self.target_x"), `Expected self.target_x in: ${js}`);
        assert.ok(js.includes("self.target_y"), `Expected self.target_y in: ${js}`);
        assert.ok(js.includes("self.x"), `Expected self.x in: ${js}`);
        assert.ok(js.includes("self.y"), `Expected self.y in: ${js}`);
        assert.ok(js.includes("self.hspeed"), `Expected self.hspeed in: ${js}`);
        assert.ok(js.includes("self.vspeed"), `Expected self.vspeed in: ${js}`);
        assert.ok(js.includes("self.speed"), `Expected self.speed in: ${js}`);
        // Built-in function sqrt should not be prefixed
        assert.ok(!js.includes("self.sqrt"), `Unexpected self.sqrt in: ${js}`);
    });
});
