// Re-export the shared functional helpers from @gml-modules/core to keep the
// parser aligned with the central implementation.
import { Core } from "@gml-modules/core";
const {
    Utils: { identity, callWithFallback, noop }
} = Core;
export { identity, callWithFallback, noop };
