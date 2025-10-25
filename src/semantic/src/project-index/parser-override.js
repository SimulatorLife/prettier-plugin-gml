import { isObjectLike } from "../../../shared/index.js";
import { getDefaultProjectIndexParser } from "./gml-parser-facade.js";

const defaultProjectIndexParser = getDefaultProjectIndexParser();

const PARSER_FACADE_OPTION_KEYS = [
    "identifierCaseProjectIndexParserFacade",
    "gmlParserFacade",
    "parserFacade"
];

export function getProjectIndexParserOverride(options) {
    if (!isObjectLike(options)) {
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
        defaultProjectIndexParser
    );
}
