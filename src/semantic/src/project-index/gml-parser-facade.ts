import { Core } from "@gml-modules/core";
import * as ParserPackage from "@gml-modules/parser";

import { SemanticScopeCoordinator } from "../scopes/identifier-scope.js";
import { formatProjectIndexSyntaxError } from "./syntax-error-formatter.js";

/**
 * Parser adapter for the project-index subsystem.
 *
 * Encapsulates the call to the GML parser with the scope-tracking options
 * required for project-wide identifier indexing. The dependency-injection
 * pattern (`createScopeTracker`) keeps the parser package free of any direct
 * import from `@gml-modules/semantic`—the semantic package owns the concrete
 * `SemanticScopeCoordinator` implementation and supplies it here at the call site.
 *
 * Dependency direction: Core ← Parser ← Semantic ← Format
 */
type ProjectIndexParser = (sourceText: string, context?: unknown) => unknown;

const PARSER_FACADE_OPTION_KEYS = ["identifierCaseProjectIndexParserFacade", "gmlParserFacade", "parserFacade"];

function parseProjectIndexSource(sourceText: string, context: unknown = {}): unknown {
    try {
        return ParserPackage.Parser.GMLParser.parse(sourceText, {
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
        });
    } catch (error) {
        if (Core.isSyntaxErrorWithLocation(error)) {
            throw formatProjectIndexSyntaxError(error, sourceText, context);
        }

        throw error;
    }
}

const defaultProjectIndexParser: ProjectIndexParser = (sourceText: string, context: unknown = {}) =>
    parseProjectIndexSource(sourceText, context);

export function getDefaultProjectIndexParser(): ProjectIndexParser {
    return defaultProjectIndexParser;
}

type ParserFacadeOverride = {
    facade: { parse: ProjectIndexParser } | null;
    parse: ProjectIndexParser;
};

function isFacadeObject(value: unknown): value is { parse: ProjectIndexParser } {
    return Core.isObjectLike(value) && typeof (value as { parse?: unknown }).parse === "function";
}

export function getProjectIndexParserOverride(options: Record<string, unknown>): ParserFacadeOverride | null {
    if (!Core.isObjectLike(options)) {
        return null;
    }

    for (const key of PARSER_FACADE_OPTION_KEYS) {
        const candidate = options[key];
        if (isFacadeObject(candidate)) {
            return {
                facade: candidate,
                parse: (sourceText: string, context?: unknown) => candidate.parse(sourceText, context)
            };
        }
    }

    const parse = options.parseGml;
    return typeof parse === "function" ? { facade: null, parse: parse as ProjectIndexParser } : null;
}

export function resolveProjectIndexParser(options: Record<string, unknown>): ProjectIndexParser {
    return getProjectIndexParserOverride(options)?.parse ?? defaultProjectIndexParser;
}
