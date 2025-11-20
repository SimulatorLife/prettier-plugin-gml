// Prettier plugin adapter: map Prettier options to the core ParserConfig and
// Transform options. This is intentionally small; it demonstrates the mapping
// layer the plugin should own.

import GMLParser, { applyTransforms } from "@gml-modules/parser";

type PrettierGmlOptions = {
    gmlLanguageVersion?: string;
    gmlExperimental?: boolean;
    gmlRelaxedSemicolons?: boolean;
    gmlPreserveDocs?: boolean;
    gmlStrictSemicolons?: boolean;
};

type ParserConfig = {
    languageVersion: string;
    allowExperimentalSyntax: boolean;
    recoverFromMissingSemicolons: boolean;
    collectComments: boolean;
};

type TransformOptions = {
    stripComments: {
        preserveDocComments: boolean;
    };
    normalizeSemicolons: {
        insertMissingSemicolons: boolean;
    };
};

type PipelineConfig = {
    parser?: ParserConfig;
    transforms?: Record<string, boolean>;
};

export function makeParserConfig(
    prettierOptions: PrettierGmlOptions = {}
): ParserConfig {
    return {
        languageVersion: prettierOptions.gmlLanguageVersion ?? "1.0",
        allowExperimentalSyntax: !!prettierOptions.gmlExperimental,
        recoverFromMissingSemicolons: !!prettierOptions.gmlRelaxedSemicolons,
        collectComments: true
    };
}

export function makeTransformOptions(
    prettierOptions: PrettierGmlOptions = {}
): TransformOptions {
    return {
        stripComments: {
            preserveDocComments: !!prettierOptions.gmlPreserveDocs
        },
        normalizeSemicolons: {
            insertMissingSemicolons: !prettierOptions.gmlStrictSemicolons
        }
    };
}

export function parseForPrettier(
    source: string,
    prettierOptions: PrettierGmlOptions = {}
) {
    const parserConfig = makeParserConfig(prettierOptions);
    const transformOpts = makeTransformOptions(prettierOptions);

    // Example pipeline: parse, then run some semantic transforms. The plugin
    // can decide which transforms to run and pass the options it built above.
    const pipelineConfig: PipelineConfig = {
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

function runPipeline(
    source: string,
    pipelineConfig: PipelineConfig,
    transformOptions: TransformOptions
) {
    const ast = GMLParser.parse(source, pipelineConfig?.parser);
    const transformEntries = pipelineConfig?.transforms ?? {};
    const transformNames = Object.entries(transformEntries)
        .filter(([, enabled]) => enabled)
        .map(([name]) => name);

    if (transformNames.length === 0) {
        return ast;
    }

    return applyTransforms(ast, transformNames, transformOptions);
}
