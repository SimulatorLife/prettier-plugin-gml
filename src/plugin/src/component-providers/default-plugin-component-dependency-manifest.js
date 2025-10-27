import { assertFunction, assertPlainObject } from "../shared/index.js";
import { gmlParserAdapter } from "../parsers/gml-parser-adapter.js";
import { print } from "../printer/print.js";
import { handleComments, printComment } from "../comments/comment-printer.js";
import { identifierCaseOptions } from "gamemaker-language-semantic/identifier-case/options.js";
import { LogicalOperatorsStyle } from "../options/logical-operators-style.js";

const REQUIRED_MANIFEST_KEYS = Object.freeze([
    "gmlParserAdapter",
    "print",
    "handleComments",
    "printComment",
    "identifierCaseOptions",
    "LogicalOperatorsStyle"
]);

function createConcreteDependencyManifest() {
    return {
        gmlParserAdapter,
        print,
        handleComments,
        printComment,
        identifierCaseOptions,
        LogicalOperatorsStyle
    };
}

function normalizeManifest(candidate) {
    const manifest = assertPlainObject(candidate, {
        errorMessage:
            "GML plugin dependency manifests must resolve to an object."
    });

    for (const key of REQUIRED_MANIFEST_KEYS) {
        if (!Object.hasOwn(manifest, key)) {
            throw new TypeError(
                `GML plugin dependency manifests must define ${key}.`
            );
        }
    }

    return Object.freeze({
        gmlParserAdapter: manifest.gmlParserAdapter,
        print: manifest.print,
        handleComments: manifest.handleComments,
        printComment: manifest.printComment,
        identifierCaseOptions: manifest.identifierCaseOptions,
        LogicalOperatorsStyle: manifest.LogicalOperatorsStyle
    });
}

let manifestResolver = () =>
    normalizeManifest(createConcreteDependencyManifest());

let cachedManifest = null;

function resolveManifest() {
    const resolved = manifestResolver();

    // Allow resolvers to return cached objects without re-freezing them by
    // short-circuiting when they provide the previously cached manifest.
    if (resolved === cachedManifest && cachedManifest !== null) {
        return cachedManifest;
    }

    cachedManifest = normalizeManifest(resolved);
    return cachedManifest;
}

export function resolveDefaultGmlPluginComponentDependencyManifest() {
    return resolveManifest();
}

export function setDefaultGmlPluginComponentDependencyManifestResolver(
    resolver
) {
    manifestResolver = assertFunction(resolver, "resolver", {
        errorMessage:
            "GML plugin dependency manifest resolvers must be functions."
    });
    cachedManifest = null;
    return resolveManifest();
}

export function resetDefaultGmlPluginComponentDependencyManifestResolver() {
    manifestResolver = () =>
        normalizeManifest(createConcreteDependencyManifest());
    cachedManifest = null;
    return resolveManifest();
}
