// Prettier plugin adapter: map Prettier options to the core ParserConfig and
// Transform options. This is intentionally small; it demonstrates the mapping
// layer the plugin should own.

import { Core } from "@gml-modules/core";

import { applyTransforms } from "@gml-modules/parser";

// Use Core.parse directly rather than destructuring the Core namespace.

export function makeParserConfig(prettierOptions = {}) {
    return {
        languageVersion: prettierOptions.gmlLanguageVersion ?? "1.0",
        allowExperimentalSyntax: !!prettierOptions.gmlExperimental,
        recoverFromMissingSemicolons: !!prettierOptions.gmlRelaxedSemicolons,
        collectComments: true
    };
}

export function makeTransformOptions(prettierOptions = {}) {
    return {
        stripComments: {
            preserveDocComments: !!prettierOptions.gmlPreserveDocs
        },
        normalizeSemicolons: {
            insertMissingSemicolons: !prettierOptions.gmlStrictSemicolons
        }
    };
}

export function parseForPrettier(source, prettierOptions = {}) {
    const parserConfig = makeParserConfig(prettierOptions);
    const transformOpts = makeTransformOptions(prettierOptions);

    // Example pipeline: parse, then run some semantic transforms. The plugin
    // can decide which transforms to run and pass the options it built above.
    const pipelineConfig = {
        parser: parserConfig,
        transforms: {
            // enable parser-side transforms by name. The plugin adopts a
            // "parser-first" approach: the parser is authoritative for
            // doc-comment and parameter-default heuristics. Enable the
            // preprocess transform so DefaultParameter nodes and the
            // _feather* metadata are produced before printing.
            "preprocess-function-argument-defaults": true
        }
    };

    return runPipeline(source, pipelineConfig, transformOpts);
}

function runPipeline(source, pipelineConfig, transformOptions) {
    const ast = Core.parse(source, pipelineConfig?.parser);
    const transformEntries = pipelineConfig?.transforms ?? {};
    const transformNames = Object.entries(transformEntries)
        .filter(([, enabled]) => enabled)
        .map(([name]) => name);

    if (transformNames.length === 0) {
        return ast;
    }

    return applyTransforms(ast, transformNames, transformOptions);
}
