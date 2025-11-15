// Core parser adapter: expose a minimal `parse` API backed by the existing
// parser implementation. This wrapper keeps the core-facing API stable while
// allowing the underlying parser implementation to live under `src/parser`.

import GMLParser from "@gml-modules/parser";

export function parse(text, options = {}) {
    return GMLParser.parse(text, options);
}


export {default as GMLParser} from "@gml-modules/parser";
