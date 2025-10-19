import assert from "node:assert/strict";
import test from "node:test";

import { assignClonedLocation } from "../ast-locations.js";

function createLocation(line) {
    return { line, column: line - 1 };
}

test("assignClonedLocation clones start and end metadata", () => {
    const target = {};
    const template = {
        start: createLocation(1),
        end: createLocation(2)
    };

    const result = assignClonedLocation(target, template);

    assert.strictEqual(result, target);
    assert.deepStrictEqual(target.start, template.start);
    assert.deepStrictEqual(target.end, template.end);
    assert.notStrictEqual(target.start, template.start);
    assert.notStrictEqual(target.end, template.end);
});

test("assignClonedLocation ignores missing boundaries", () => {
    const target = {};
    const template = { start: createLocation(3) };

    assignClonedLocation(target, template);

    assert.deepStrictEqual(target.start, template.start);
    assert.notStrictEqual(target.start, template.start);
    assert.ok(!Object.hasOwn(target, "end"));
});

test("assignClonedLocation gracefully handles invalid inputs", () => {
    const template = {
        start: createLocation(5),
        end: createLocation(6)
    };

    assert.strictEqual(assignClonedLocation(null, template), null);
    assert.strictEqual(assignClonedLocation(undefined, template), undefined);

    const targetWithoutTemplate = {};
    assert.strictEqual(
        assignClonedLocation(targetWithoutTemplate, null),
        targetWithoutTemplate
    );

    const targetWithPrimitiveTemplate = {};
    assert.strictEqual(
        assignClonedLocation(targetWithPrimitiveTemplate, 42),
        targetWithPrimitiveTemplate
    );
});
