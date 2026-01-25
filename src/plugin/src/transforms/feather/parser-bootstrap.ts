/**
 * Loads a lightweight parser instance to produce example AST fragments for Feather fixes that require small code snippets.
 */
import { Parser } from "@gml-modules/parser";

const DEFAULT_PARSE_EXAMPLE_OPTIONS = Object.freeze({
    getLocations: true,
    simplifyLocations: false
});

export function parseExample(
    sourceText: string,
    options: { getLocations?: boolean; simplifyLocations?: boolean } | undefined
) {
    if (typeof sourceText !== "string" || sourceText.length === 0) {
        return null;
    }

    try {
        const resolvedOptions = options ?? DEFAULT_PARSE_EXAMPLE_OPTIONS;
        return Parser.GMLParser.parse(sourceText, {
            getLocations: resolvedOptions.getLocations ?? true,
            simplifyLocations: resolvedOptions.simplifyLocations ?? false
        });
    } catch {
        // Parsing example failed — return null and let caller handle absence
        return null;
    }
}
