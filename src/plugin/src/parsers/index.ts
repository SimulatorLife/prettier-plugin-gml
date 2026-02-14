// Public facade for parser adapters used by the Prettier plugin
export { parseExample } from "./feather-example-parser.js";
export type {
    GmlParserAdapterConfig,
    GmlParserAdapterOptions,
    IdentifierCaseRuntime,
    ScopeTrackerFactory
} from "./gml-parser-adapter.js";
export { createGmlParserAdapter, gmlParserAdapter, setIdentifierCaseRuntime } from "./gml-parser-adapter.js";
export type { PrettierGmlOptions } from "./prettier-adapter.js";
export { prettierParserAdapter } from "./prettier-adapter.js";
