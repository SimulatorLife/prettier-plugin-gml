// Public facade for parser adapters used by the Prettier plugin
export type { GmlParserAdapterConfig, GmlParserAdapterOptions, ScopeTrackerFactory } from "./gml-parser-adapter.js";
export { createGmlParserAdapter, gmlParserAdapter } from "./gml-parser-adapter.js";
export type { PrettierGmlOptions } from "./prettier-adapter.js";
export { prettierParserAdapter } from "./prettier-adapter.js";
