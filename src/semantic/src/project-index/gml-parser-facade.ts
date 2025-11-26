import { Core } from "@gml-modules/core";
import * as Parser from "@gml-modules/parser";

import { SemanticScopeCoordinator } from "../scopes/identifier-scope.js";
import { formatProjectIndexSyntaxError } from "./syntax-error-formatter.js";

// TODO: This is a workaround because currently the parser and 'semantic' depend on each other. Need to properly decouple. Once the parser is fully rebuilt we can likely remove this and directly import from the parser package (or have 'parser' have one-way dependency on 'semantic').
type ParserNamespace = typeof import("@gml-modules/parser").Parser;
type ProjectIndexParser = (sourceText: string, context?: unknown) => unknown;

let parserNamespace: ParserNamespace | null = null;
let defaultProjectIndexParser: ProjectIndexParser | null = null;

const PARSER_FACADE_OPTION_KEYS = [
    "identifierCaseProjectIndexParserFacade",
    "gmlParserFacade",
    "parserFacade"
];

export function setProjectIndexParserNamespace(parser: ParserNamespace): void {
    parserNamespace = parser;
}

function resolveParserNamespace(parser?: ParserNamespace): ParserNamespace {
    if (parser) {
        return parser;
    }

    if (!parserNamespace && Parser.Parser) {
        parserNamespace = Parser.Parser as ParserNamespace;
    }

    if (parserNamespace) {
        return parserNamespace;
    }

    throw new Error(
        "Parser namespace is not initialized; call setProjectIndexParserNamespace first."
    );
}

function parseProjectIndexSource(
    sourceText: string,
    context = {},
    parser: ParserNamespace | null = null
) {
    const parserApi = resolveParserNamespace(parser);

    try {
        // TODO: Fix/correct this. We just casted to 'any' because ParserOptions differs across parser package types in the
        // workspace during incremental refactors, so provided the runtime options we needed
        // while avoiding a compile-time type mismatch until the parser package is
        // fully rebuilt.
        return parserApi.GMLParser.parse(sourceText, {
            getComments: false,
            getLocations: true,
            simplifyLocations: false,
            astFormat: "gml",
            asJSON: false,
            scopeTrackerOptions: {
                enabled: true,
                getIdentifierMetadata: true,
                createScopeTracker: () => new SemanticScopeCoordinator()
            }
        } as any);
    } catch (error) {
        if (parserApi.isSyntaxErrorWithLocation(error)) {
            throw formatProjectIndexSyntaxError(error, sourceText, context);
        }

        throw error;
    }
}

function resolveDefaultProjectIndexParser(): ProjectIndexParser {
    if (!defaultProjectIndexParser) {
        defaultProjectIndexParser = getDefaultProjectIndexParser();
    }

    return defaultProjectIndexParser;
}

export function getDefaultProjectIndexParser(
    parser: ParserNamespace | null = null
) {
    return (sourceText: string, context = {}) =>
        parseProjectIndexSource(sourceText, context, parser);
}

export function getProjectIndexParserOverride(options) {
    if (!Core.isObjectLike(options)) {
        return null;
    }

    for (const key of PARSER_FACADE_OPTION_KEYS) {
        const facade = options[key];
        if (typeof facade?.parse === "function") {
            return {
                facade,
                parse: facade.parse.bind(facade)
            };
        }
    }

    const parse = options.parseGml;
    return typeof parse === "function" ? { facade: null, parse } : null;
}

export function resolveProjectIndexParser(options) {
    return (
        getProjectIndexParserOverride(options)?.parse ??
        resolveDefaultProjectIndexParser()
    );
}
