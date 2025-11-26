// TODO: Its confusing that we have this and 'src/semantic/src/project-index/gml-parser-facade.ts'. Can they be combined?

import { Core } from "@gml-modules/core";

import { getDefaultProjectIndexParser } from "./gml-parser-facade.js";

let defaultProjectIndexParser: ((...args: Array<unknown>) => unknown) | null =
    null;

function resolveDefaultParser() {
    if (!defaultProjectIndexParser) {
        defaultProjectIndexParser = getDefaultProjectIndexParser();
    }

    return defaultProjectIndexParser;
}

const PARSER_FACADE_OPTION_KEYS = [
    "identifierCaseProjectIndexParserFacade",
    "gmlParserFacade",
    "parserFacade"
];

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
        getProjectIndexParserOverride(options)?.parse ?? resolveDefaultParser()
    );
}
