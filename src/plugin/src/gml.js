// gml.js

import { gmlParserAdapter } from "./parsers/gml-parser-adapter.js";
import { print } from "./printer/print.js";
import { handleComments, printComment } from "./printer/comments.js";
import { identifierCaseOptions } from "./options/identifier-case.js";

export const languages = [
    {
        name: "GameMaker Language",
        extensions: [".gml"],
        parsers: ["gml-parse"],
        vscodeLanguageIds: ["gml-gms2", "gml"]
    }
];

export const parsers = {
    "gml-parse": {
        ...gmlParserAdapter,
        parse: (text, _parsers, options) =>
            gmlParserAdapter.parse(text, options)
    }
};

export const printers = {
    "gml-ast": {
        print: print,
        isBlockComment: (comment) => comment.type === "CommentBlock",
        canAttachComment: (node) =>
            node.type &&
            !node.type.includes("Comment") &&
            node.type !== "EmptyStatement",
        printComment: printComment,
        handleComments: handleComments
    }
};

export const options = {
    optimizeLoopLengthHoisting: {
        since: "0.0.0",
        type: "boolean",
        category: "gml",
        default: true,
        description:
            "Hoist supported loop size calls out of for-loop conditions by caching the result in a temporary variable."
    },
    condenseStructAssignments: {
        since: "0.0.0",
        type: "boolean",
        category: "gml",
        default: true,
        description:
            "Condense consecutive struct property assignments into a single struct literal when possible."
    },
    loopLengthHoistFunctionSuffixes: {
        since: "0.0.0",
        type: "string",
        category: "gml",
        default: "",
        description:
            "Comma-separated overrides for cached loop size variable suffixes (e.g. 'array_length=len,ds_queue_size=count'). Use '-' as the suffix to disable a function."
    },
    allowSingleLineIfStatements: {
        since: "0.0.0",
        type: "boolean",
        category: "gml",
        default: true,
        description:
            "Collapse single-statement 'if' bodies to a single line (for example, 'if (condition) { return; }'). Disable to always expand the consequent across multiple lines."
    },
    logicalOperatorsStyle: {
        since: "0.0.0",
        type: "choice",
        category: "gml",
        default: "keywords",
        description:
            "Controls whether logical '&&'/'||' operators are rewritten using GameMaker's word forms. Set to 'symbols' to keep the original operators while formatting.",
        choices: [
            {
                value: "keywords",
                description:
                    "Replace '&&' and '||' with the GameMaker keywords 'and' and 'or'."
            },
            {
                value: "symbols",
                description:
                    "Preserve the symbolic logical operators exactly as written in the source."
            }
        ]
    },
    condenseLogicalExpressions: {
        since: "0.0.0",
        type: "boolean",
        category: "gml",
        default: false,
        description:
            "Condense complementary logical return branches into simplified boolean expressions when it is safe to do so."
    },
    preserveGlobalVarStatements: {
        since: "0.0.0",
        type: "boolean",
        category: "gml",
        default: true,
        description:
            "Preserve 'globalvar' declarations instead of eliding them during formatting."
    },
    lineCommentBannerMinimumSlashes: {
        since: "0.0.0",
        type: "int",
        category: "gml",
        default: 5,
        range: { start: 1, end: Infinity },
        description:
            "Minimum number of consecutive '/' characters that must prefix a line comment before it is preserved verbatim."
    },
    lineCommentBannerAutofillThreshold: {
        since: "0.0.0",
        type: "int",
        category: "gml",
        default: 4,
        range: { start: 0, end: Infinity },
        description:
            "Autofill banner comments up to the minimum slash count when they already start with this many '/' characters. Set to 0 to disable autofilling."
    },
    lineCommentBoilerplateFragments: {
        since: "0.0.0",
        type: "string",
        category: "gml",
        default: "",
        description:
            "Comma-separated substrings that mark trimmed line comments as boilerplate to remove. Provide additional fragments to extend the built-in filter."
    },
    alignAssignmentsMinGroupSize: {
        since: "0.0.0",
        type: "int",
        category: "gml",
        default: 3,
        range: { start: 0, end: Infinity },
        description:
            "Minimum number of consecutive simple assignments required before the formatter aligns their '=' operators. Set to 0 to disable alignment entirely."
    },
    trailingCommentPadding: {
        since: "0.0.0",
        type: "int",
        category: "gml",
        default: 2,
        range: { start: 0, end: Infinity },
        description:
            "Spaces inserted between the end of code and trailing comments. Increase to push inline comments further right or set to 0 to minimize padding."
    },
    trailingCommentInlineOffset: {
        since: "0.0.0",
        type: "int",
        category: "gml",
        default: 1,
        range: { start: 0, end: Infinity },
        description:
            "Spaces trimmed from trailingCommentPadding when applying inline comment padding. Set to 0 to keep inline and trailing padding identical."
    },
    maxParamsPerLine: {
        since: "0.0.0",
        type: "int",
        category: "gml",
        default: 0,
        range: { start: 0, end: Infinity },
        description:
            "Maximum number of arguments allowed on a single line before a function call is forced to wrap. Set to 0 to disable."
    },
    applyFeatherFixes: {
        since: "0.0.0",
        type: "boolean",
        category: "gml",
        default: false,
        description:
            "Apply safe auto-fixes derived from GameMaker Feather diagnostics (e.g. remove trailing semicolons from macro declarations flagged by GM1051)."
    },
    ...identifierCaseOptions,
    useStringInterpolation: {
        since: "0.0.0",
        type: "boolean",
        category: "gml",
        default: false,
        description:
            'Rewrite string concatenations like "Hello " + name + "!" into template strings such as $"Hello {name}!" when all parts are safely composable.'
    },
    convertDivisionToMultiplication: {
        since: "0.0.0",
        type: "boolean",
        category: "gml",
        default: false,
        description:
            "Rewrite division by a literal constant into multiplication by its reciprocal when it is safe to do so."
    }
};

const BASE_PRETTIER_DEFAULTS = {
    tabWidth: 4,
    semi: true,
    trailingComma: "none",
    printWidth: 120
};

function extractOptionDefaults(optionConfigMap) {
    const defaults = {};

    for (const [name, config] of Object.entries(optionConfigMap)) {
        if (config && Object.hasOwn(config, "default")) {
            defaults[name] = config.default;
        }
    }

    return defaults;
}

const gmlOptionDefaults = extractOptionDefaults(options);

export const defaultOptions = {
    ...BASE_PRETTIER_DEFAULTS,
    ...gmlOptionDefaults
};
