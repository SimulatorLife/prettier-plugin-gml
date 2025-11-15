// Re-export regular expression helpers from @gml-modules/core.
import { Core } from "@gml-modules/core";

const {
    Utils: { escapeRegExp }
} = Core;
export { escapeRegExp };
