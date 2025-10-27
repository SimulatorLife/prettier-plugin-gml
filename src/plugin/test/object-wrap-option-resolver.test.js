import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
    ObjectWrapOption,
    resolveObjectWrapOption,
    resetObjectWrapOptionResolver,
    setObjectWrapOptionResolver
} from "../src/options/object-wrap-option.js";

afterEach(() => {
    resetObjectWrapOptionResolver();
});

describe("resolveObjectWrapOption", () => {
    it("preserves object wrapping by default", () => {
        const resolved = resolveObjectWrapOption();

        assert.equal(resolved, ObjectWrapOption.PRESERVE);
    });

    it("honours the collapse option provided by Prettier", () => {
        const resolved = resolveObjectWrapOption({
            objectWrap: ObjectWrapOption.COLLAPSE
        });

        assert.equal(resolved, ObjectWrapOption.COLLAPSE);
    });

    it("allows advanced integrations to override the resolver", () => {
        const cleanup = setObjectWrapOptionResolver(
            () => ObjectWrapOption.COLLAPSE
        );

        const resolved = resolveObjectWrapOption();

        assert.equal(resolved, ObjectWrapOption.COLLAPSE);

        cleanup();

        assert.equal(resolveObjectWrapOption(), ObjectWrapOption.PRESERVE);
    });

    it("falls back to the default when the resolver returns an invalid value", () => {
        setObjectWrapOptionResolver(() => "invalid");

        const resolved = resolveObjectWrapOption({
            objectWrap: ObjectWrapOption.COLLAPSE
        });

        assert.equal(resolved, ObjectWrapOption.PRESERVE);
    });
});
