import { type GmlParserAdapterOptions } from "./gml-parser-adapter.js";

export type PrettierGmlOptions = GmlParserAdapterOptions;

/**
 * Re-export the GML parser adapter directly for use by Prettier.
 * The adapter already implements the correct Parser<GmlAst> interface and handles
 * options appropriately, so no wrapper is needed.
 */

export { gmlParserAdapter as prettierParserAdapter } from "./gml-parser-adapter.js";
