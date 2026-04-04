import test from "node:test";
import assert from "node:assert";
import { Parser } from "@gml-modules/parser";
import { AST, Traverser } from "@gml-modules/core";

test("should parse oPlayer", () => {
    const code = `
    .add("follow", {
        enter: function() {},
        step: function() {
            if (follow_id < 0) {
                if (instance_exists(oPlayer)) {
                    follow_id = oPlayer.id;
                }
            }
        }
    });`;
    
    const ast = Parser.parse(code);
    const identifiers: string[] = [];
    Traverser.walk(ast, {
        Identifier(node) {
            identifiers.push(node.name);
        }
    });
    console.log("Identifiers:", identifiers);
});
