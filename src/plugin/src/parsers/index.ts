// Public facade for parser adapters used by the Prettier plugin
export type {
    GmlParserAdapterConfig,
    GmlParserAdapterOptions,
    IdentifierCaseRuntime,
    ScopeTrackerFactory
} from "./gml-parser-adapter.js";
export { createGmlParserAdapter, gmlParserAdapter, setIdentifierCaseRuntime } from "./gml-parser-adapter.js";
