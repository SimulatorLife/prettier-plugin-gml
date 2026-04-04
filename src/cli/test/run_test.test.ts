import test from "node:test";

import { Traverser } from "@gmloop/core";
import { Parser } from "@gmloop/parser";

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
