import GMLParser from "../../../parser/gml-parser.js";

function parseProjectIndexSource(sourceText) {
    return GMLParser.parse(sourceText, {
        getComments: false,
        getLocations: true,
        simplifyLocations: false,
        getIdentifierMetadata: true
    });
}

export function getDefaultProjectIndexParser() {
    return parseProjectIndexSource;
}
