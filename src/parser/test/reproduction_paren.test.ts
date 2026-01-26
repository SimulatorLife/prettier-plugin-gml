import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GMLParser } from "../src/gml-parser.js";

void describe("Grammar reproduction tests (Parenthesized expressions)", () => {
	void it("should allow property access on parenthesized function calls", () => {
		const source = "return (input_xy(_verb_l, _verb_r, _verb_u, _verb_d, _player_index, _most_recent)).x;";
		assert.doesNotThrow(() => GMLParser.parse(source));
	});

	void it("should allow property access on parenthesized expressions in general", () => {
		const source = "var a = (b + c).d;";
		assert.doesNotThrow(() => GMLParser.parse(source));
	});
});
