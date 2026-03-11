/**
 * Verifies that GmlParserBridge and GmlTranspilerBridge implement the canonical
 * interfaces from @gml-modules/refactor rather than local type duplicates.
 *
 * This is a compile-time/structural test: if the bridge classes ever diverge from
 * the canonical Refactor.ParserBridge or Refactor.TranspilerBridge interfaces, the
 * type assertions below will produce a TypeScript error that fails the build.
 */
import { describe, it } from "node:test";

import type * as Refactor from "@gml-modules/refactor";

import { GmlParserBridge } from "../src/modules/refactor/parser-bridge.js";
import { GmlTranspilerBridge } from "../src/modules/refactor/transpiler-bridge.js";

void describe("Bridge canonical type conformance", () => {
    void it("GmlParserBridge satisfies Refactor.ParserBridge", () => {
        // Compile-time assertion: fails build if GmlParserBridge no longer
        // implements the canonical Refactor.ParserBridge interface.
        const _: Refactor.ParserBridge = new GmlParserBridge();
        void _;
    });

    void it("GmlTranspilerBridge satisfies Refactor.TranspilerBridge", () => {
        // Compile-time assertion: fails build if GmlTranspilerBridge no longer
        // implements the canonical Refactor.TranspilerBridge interface.
        const _: Refactor.TranspilerBridge = new GmlTranspilerBridge();
        void _;
    });
});
