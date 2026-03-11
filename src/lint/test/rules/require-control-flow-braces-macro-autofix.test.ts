import { test } from "node:test";

import { assertEquals } from "../assertions.js";
import { lintWithRule } from "./lint-rule-test-harness.js";

const capsuleMacroSource = [
    "#macro CM_TRIANGLE_GET_CAPSULE_REF\tvar e00 = v2x - v1x, e01 = v2y - v1y, e02 = v2z - v1z;\\",
    "\t\t\t\t\t\t\t\t\tvar e0 = dot_product_3d(e00, e01, e02, e00, e01, e02);\\",
    "\t\t\t\t\t\t\t\t\tvar e10 = v3x - v2x, e11 = v3y - v2y, e12 = v3z - v2z;\\",
    "\t\t\t\t\t\t\t\t\tvar e1 = dot_product_3d(e10, e11, e12, e10, e11, e12);\\",
    "\t\t\t\t\t\t\t\t\tvar e20 = v1x - v3x, e21 = v1y - v3y, e22 = v1z - v3z;\\",
    "\t\t\t\t\t\t\t\t\tvar e2 = dot_product_3d(e20, e21, e22, e20, e21, e22);\\",
    "\t\t\t\t\t\t\t\t\tvar pd = -1;\\ //Penetration depth, basically how far the central axis of the capsule penetrates the triangle",
    "\t\t\t\t\t\t\t\t\tvar dp = dot_product_3d(xup, yup, zup, nx, ny, nz);\\",
    "\t\t\t\t\t\t\t\t\tif (dp != 0)\\",
    "\t\t\t\t\t\t\t\t\t{\\",
    "\t\t\t\t\t\t\t\t\t\tvar trace = dot_product_3d(v1x - X, v1y - Y, v1z - Z, nx, ny, nz) / dp;\\",
    "\t\t\t\t\t\t\t\t\t\tvar traceX = X + xup * trace;\\",
    "\t\t\t\t\t\t\t\t\t\tvar traceY = Y + yup * trace;\\",
    "\t\t\t\t\t\t\t\t\t\tvar traceZ = Z + zup * trace;\\",
    "\t\t\t\t\t\t\t\t\t\tvar tx = traceX - v1x, ty = traceY - v1y, tz = traceZ - v1z;\\",
    "\t\t\t\t\t\t\t\t\t\tvar e = e0, ex = e00, ey = e01, ez = e02;\\",
    "\t\t\t\t\t\t\t\t\t\tif (dot_product_3d(tz * ey - ty * ez, tx * ez - tz * ex, ty * ex - tx * ey, nx, ny, nz) > 0)\\",
    "\t\t\t\t\t\t\t\t\t\t{\\",
    "\t\t\t\t\t\t\t\t\t\t\ttx = traceX - v2x; ty = traceY - v2y; tz = traceZ - v2z;\\",
    "\t\t\t\t\t\t\t\t\t\t\te = e1; ex = e10; ey = e11; ez = e12;\\",
    "\t\t\t\t\t\t\t\t\t\t\tif (dot_product_3d(tz * ey - ty * ez, tx * ez - tz * ex, ty * ex - tx * ey, nx, ny, nz) > 0)\\",
    "\t\t\t\t\t\t\t\t\t\t\t{\\",
    "\t\t\t\t\t\t\t\t\t\t\t\ttx = traceX - v3x; ty = traceY - v3y; tz = traceZ - v3z;\\",
    "\t\t\t\t\t\t\t\t\t\t\t\te = e2; ex = e20; ey = e21; ez = e22;\\",
    "\t\t\t\t\t\t\t\t\t\t\t\tif (dot_product_3d(tz * ey - ty * ez, tx * ez - tz * ex, ty * ex - tx * ey, nx, ny, nz) > 0)\\",
    "\t\t\t\t\t\t\t\t\t\t\t\t{\\",
    "\t\t\t\t\t\t\t\t\t\t\t\t\tpd = clamp(trace, 0, height);\\",
    "\t\t\t\t\t\t\t\t\t\t\t\t}\\",
    "\t\t\t\t\t\t\t\t\t\t\t}\\",
    "\t\t\t\t\t\t\t\t\t\t}\\",
    "\t\t\t\t\t\t\t\t\t\tif (pd < 0)\\",
    "\t\t\t\t\t\t\t\t\t\t{\\\t//The trace is outside an edge of the triangle. Find the closest point along the edge.",
    "\t\t\t\t\t\t\t\t\t\t\tvar dx = X + tx - traceX;\\",
    "\t\t\t\t\t\t\t\t\t\t\tvar dy = Y + ty - traceY;\\",
    "\t\t\t\t\t\t\t\t\t\t\tvar dz = Z + tz - traceZ;\\",
    "\t\t\t\t\t\t\t\t\t\t\tvar upDp = dot_product_3d(ex, ey, ez, xup, yup, zup);\\",
    "\t\t\t\t\t\t\t\t\t\t\tif (upDp * upDp == e) pd = clamp(dot_product_3d(dx, dy, dz, xup, yup, zup), 0, height);\\",
    "\t\t\t\t\t\t\t\t\t\t\telse\\",
    "\t\t\t\t\t\t\t\t\t\t\t{\\",
    "\t\t\t\t\t\t\t\t\t\t\t\tvar w1 = dot_product_3d(dx, dy, dz, ex, ey, ez);\\",
    "\t\t\t\t\t\t\t\t\t\t\t\tvar w2 = dot_product_3d(dx, dy, dz, xup, yup, zup);\\",
    "\t\t\t\t\t\t\t\t\t\t\t\tvar s = clamp((w1 - w2 * upDp) / (e - upDp * upDp), 0, 1);\\",
    "\t\t\t\t\t\t\t\t\t\t\t\tpd = clamp(dot_product_3d(ex * s - dx, ey * s - dy, ez * s - dz, xup, yup, zup), 0, height);\\",
    "\t\t\t\t\t\t\t\t\t\t\t}\\",
    "\t\t\t\t\t\t\t\t\t\t}\\",
    "\t\t\t\t\t\t\t\t\t}\\",
    "\t\t\t\t\t\t\t\t\telse\\",
    "\t\t\t\t\t\t\t\t\t{\\",
    "\t\t\t\t\t\t\t\t\t\tpd = clamp(dot_product_3d(v1x - X, v1y - Y, v1z - Z, xup, yup, zup), 0, height);\\",
    "\t\t\t\t\t\t\t\t\t}\\",
    "\t\t\t\t\t\t\t\t\tvar refX = X + xup * pd;\\",
    "\t\t\t\t\t\t\t\t\tvar refY = Y + yup * pd;\\",
    "\t\t\t\t\t\t\t\t\tvar refZ = Z + zup * pd",
    ""
].join("\n");

function collectContinuationLineIndexes(source: string): Array<number> {
    return source.split("\n").flatMap((line, index) => (line.trimEnd().endsWith("\\") ? [index] : []));
}

void test("require-control-flow-braces autofix preserves long capsule macro output and continuation slashes", () => {
    const result = lintWithRule("require-control-flow-braces", capsuleMacroSource, {});

    assertEquals(result.messages.length, 0);
    assertEquals(result.output, capsuleMacroSource);

    const inputLines = capsuleMacroSource.split("\n");
    const outputLines = result.output.split("\n");
    for (const lineIndex of collectContinuationLineIndexes(capsuleMacroSource)) {
        assertEquals(
            outputLines[lineIndex]?.trimEnd().endsWith("\\"),
            true,
            `continuation missing on line ${lineIndex + 1}`
        );
        assertEquals(outputLines[lineIndex], inputLines[lineIndex], `line ${lineIndex + 1} changed unexpectedly`);
    }
});

void test("require-control-flow-braces keeps macro continuation when slash is followed by inline comment", () => {
    const input = [
        "#macro INLINE_COMMENT_MACRO if (enabled)\\",
        String.raw`                           {\ // keep continuation while documenting behavior`,
        "                               if (enabled) run_effect();\\",
        "                               value = 1",
        ""
    ].join("\n");

    const result = lintWithRule("require-control-flow-braces", input, {});

    assertEquals(result.messages.length, 0);
    assertEquals(result.output, input);
});
