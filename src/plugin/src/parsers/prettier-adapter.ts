// TODO: This does not actually seem to be used anywhere yet? Hook this up as/where needed
// Prettier plugin adapter: map Prettier options to the core ParserConfig and
// Transform options. This is intentionally small; it demonstrates the mapping
// layer the plugin should own.

// TODO: The parser also has similar functionality in 'src/parser/src/transforms/index.ts' that
// needs to be properly integrated/consolidated with this adapter with proper adhesion to their respective concerns (parser: AST parsing, plugin: printing).

import { Parser, type ParserOptions } from "@gml-modules/parser";
import * as Transforms from "../transforms/index.js";
import type {
    ParserTransformName,
    ParserTransformOptions
} from "../transforms/index.js";

// Use ParserOptions type from Parser package to ensure compatibility.
type ParserConfig = ParserOptions;

type PrettierGmlOptions = {
    gmlStripComments?: boolean;
};

type TransformOptions = Partial<
    Record<ParserTransformName, ParserTransformOptions>
>;

type PipelineConfig = {
    parser?: ParserConfig;
    transforms?: Record<string, boolean>;
};

export function makeParserConfig(
    prettierOptions: PrettierGmlOptions = {}
): ParserConfig {
    void prettierOptions;
    return {
        getComments: true,
        getLocations: true,
        simplifyLocations: true,
        scopeTrackerOptions: { enabled: false },
        astFormat: "gml",
        asJSON: false
        // The plugin versions and schema are not provided in the ParserOptions
        // object; parser-side validation (when added) should respect additional
        // flags we might pass via transformOptions instead of parser options.
    } as ParserConfig;
}

export function makeTransformOptions(
    prettierOptions: PrettierGmlOptions = {}
): TransformOptions {
    return prettierOptions.gmlStripComments
        ? {
              "strip-comments": {
                  // TODO: May want to expose more fine-grained options later for each behavior
                  stripComments: true,
                  stripJsDoc: true,
                  dropCommentedOutCode: true
              }
          }
        : {};
}

export function parseForPrettier(
    source: string,
    prettierOptions: PrettierGmlOptions = {}
) {
    const parserConfig = makeParserConfig(prettierOptions);
    const transformOpts = makeTransformOptions(prettierOptions);

    // Parse, then run transforms. The plugin can decide which transforms to run
    // and pass the options it built above.
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
    const ast = Parser.GMLParser.parse(source, pipelineConfig?.parser);
    const transformEntries = pipelineConfig?.transforms ?? {};
    const transformNames = Object.entries(transformEntries).reduce<
        Array<ParserTransformName>
    >((names, [name, enabled]) => {
        if (enabled && Transforms.isParserTransformName(name)) {
            names.push(name);
        }

        return names;
    }, []);

    if (transformNames.length === 0) {
        return ast;
    }

    return Transforms.applyTransforms(ast, transformNames, transformOptions);
}
