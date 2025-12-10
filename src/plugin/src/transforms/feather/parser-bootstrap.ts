/**
 * Loads a lightweight parser instance to produce example AST fragments for Feather fixes that require small code snippets.
 */
import { Parser } from "@gml-modules/parser";

export function parseExample(
    sourceText: string,
    options: { getLocations?: boolean; simplifyLocations?: boolean } = {
        getLocations: true,
        simplifyLocations: false
    }
) {
    if (typeof sourceText !== "string" || sourceText.length === 0) {
        return null;
    }

    try {
        return Parser.GMLParser.parse(sourceText, {
            getLocations: options.getLocations ?? true,
            simplifyLocations: options.simplifyLocations ?? false
        });
    } catch {
        // Parsing example failed — return null and let caller handle absence
        return null;
    }
}
