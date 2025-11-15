// Re-export line break helpers from @gml-modules/core to keep parser behavior
// aligned with the shared implementation.
import { Core } from "@gml-modules/core";
const { getLineBreakSpans, getLineBreakCount, splitLines } = Core;
export { getLineBreakSpans, getLineBreakCount, splitLines };

