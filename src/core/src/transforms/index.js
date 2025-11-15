// Core transforms adapter: re-export the parser's existing transform registry
// so consumers can import `src/core/transforms` while we migrate code into
// a dedicated core transforms package later.

export { applyTransforms, availableTransforms } from "@gml-modules/parser";
