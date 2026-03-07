import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";

import { Transpiler } from "../index.js";

void describe("LocalVarScope", () => {
    void it("starts with depth 0", () => {
        const scope = new Transpiler.LocalVarScope();
        strictEqual(scope.depth, 0);
    });

    void it("depth increases on push", () => {
        const scope = new Transpiler.LocalVarScope();
        scope.push();
        strictEqual(scope.depth, 1);
        scope.push();
        strictEqual(scope.depth, 2);
    });

    void it("depth decreases on pop", () => {
        const scope = new Transpiler.LocalVarScope();
        scope.push();
        scope.pop();
        strictEqual(scope.depth, 1);
        scope.pop();
        strictEqual(scope.depth, 0);
    });

    void it("declare adds name to current scope", () => {
        const scope = new Transpiler.LocalVarScope();
        scope.push();
        scope.declare("x");
        strictEqual(scope.isLocal("x"), true);
    });

    void it("isLocal returns false for undeclared name", () => {
        const scope = new Transpiler.LocalVarScope();
        scope.push();
        strictEqual(scope.isLocal("undeclared"), false);
    });

    void it("isLocal returns false when stack is empty", () => {
        const scope = new Transpiler.LocalVarScope();
        strictEqual(scope.isLocal("anything"), false);
    });

    void it("declare is no-op when stack is empty", () => {
        const scope = new Transpiler.LocalVarScope();
        // Should not throw; declare outside a scope is silently ignored
        scope.declare("x");
        strictEqual(scope.isLocal("x"), false);
    });

    void it("name visible in inner scope sees outer declaration", () => {
        const scope = new Transpiler.LocalVarScope();
        scope.push(); // outer
        scope.declare("outerVar");
        scope.push(); // inner
        strictEqual(scope.isLocal("outerVar"), true, "inner scope should see outer declaration");
    });

    void it("name visible only within its declaring scope", () => {
        const scope = new Transpiler.LocalVarScope();
        scope.push(); // inner
        scope.declare("innerVar");
        scope.pop(); // leave inner
        strictEqual(scope.isLocal("innerVar"), false, "outer scope should not see inner declaration");
    });

    void it("inner declaration shadows outer without affecting it", () => {
        const scope = new Transpiler.LocalVarScope();
        scope.push(); // outer
        scope.declare("name");
        scope.push(); // inner
        scope.declare("name"); // shadow
        strictEqual(scope.isLocal("name"), true, "inner sees shadowed name");
        scope.pop();
        strictEqual(scope.isLocal("name"), true, "outer still has the name after inner pops");
    });

    void it("multiple names can be declared in the same scope", () => {
        const scope = new Transpiler.LocalVarScope();
        scope.push();
        scope.declare("a");
        scope.declare("b");
        scope.declare("c");
        strictEqual(scope.isLocal("a"), true);
        strictEqual(scope.isLocal("b"), true);
        strictEqual(scope.isLocal("c"), true);
    });

    void it("pop clears all names in that scope level", () => {
        const scope = new Transpiler.LocalVarScope();
        scope.push();
        scope.declare("x");
        scope.declare("y");
        scope.pop();
        strictEqual(scope.isLocal("x"), false);
        strictEqual(scope.isLocal("y"), false);
    });

    void it("multiple push/pop cycles work correctly", () => {
        const scope = new Transpiler.LocalVarScope();

        scope.push();
        scope.declare("first");
        scope.pop();

        scope.push();
        strictEqual(scope.isLocal("first"), false, "name from prior cycle is gone");
        scope.declare("second");
        strictEqual(scope.isLocal("second"), true);
        scope.pop();
    });

    void it("depth accurately reflects nesting level", () => {
        const scope = new Transpiler.LocalVarScope();
        const depths: number[] = [scope.depth];
        // 0
        scope.push();
        depths.push(scope.depth); // 1
        scope.push();
        depths.push(scope.depth); // 2
        scope.pop();
        depths.push(scope.depth); // 1
        scope.pop();
        depths.push(scope.depth); // 0

        deepStrictEqual(depths, [0, 1, 2, 1, 0]);
    });
});
