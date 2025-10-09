// gml.js

import { gmlParserAdapter } from "./parsers/gml-parser-adapter.js";
import { print } from "./printer/print.js";
import { handleComments, printComment } from "./printer/comments.js";

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
        parse: (text, _parsers, options) => gmlParserAdapter.parse(text, options)
    }
};

export const printers = {
    "gml-ast": {
        print: print,
        isBlockComment: (comment) => comment.type === "CommentBlock",
        canAttachComment: (node) => node.type && !node.type.includes("Comment") && node.type !== "EmptyStatement",
        printComment: printComment,
        handleComments: handleComments
    }
};

export const options = {
    optimizeArrayLengthLoops: {
        since: "0.0.0",
        type: "boolean",
        category: "gml",
        default: true,
        description: "Hoist array_length calls out of for-loop conditions by caching the result in a temporary variable."
    },
    condenseStructAssignments: {
        since: "0.0.0",
        type: "boolean",
        category: "gml",
        default: true,
        description:
            "Condense consecutive struct property assignments into a single struct literal when possible."
    },
    arrayLengthHoistFunctionSuffixes: {
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
            "Collapse single-statement 'if' bodies to a single line (for example, 'if (condition) { return; }'). Disable to always expand the consequent across multiple lines.",
    },
    preserveGlobalVarStatements: {
        since: "0.0.0",
        type: "boolean",
        category: "gml",
        default: true,
        description: "Preserve 'globalvar' declarations instead of eliding them during formatting.",
    },
    lineCommentBannerMinimumSlashes: {
        since: "0.0.0",
        type: "int",
        category: "gml",
        default: 5,
        range: { start: 1, end: Infinity },
        description:
            "Minimum number of consecutive '/' characters that must prefix a line comment before it is preserved verbatim.",
    },
    lineCommentBannerAutofillThreshold: {
        since: "0.0.0",
        type: "int",
        category: "gml",
        default: 4,
        range: { start: 0, end: Infinity },
        description:
            "Autofill banner comments up to the minimum slash count when they already start with this many '/' characters. Set to 0 to disable autofilling.",
    },
    alignAssignmentsMinGroupSize: {
        since: "0.0.0",
        type: "int",
        category: "gml",
        default: 3,
        range: { start: 0, end: Infinity },
        description:
            "Minimum number of consecutive simple assignments required before the formatter aligns their '=' operators. Set to 0 to disable alignment entirely.",
    },
    maxParamsPerLine: {
        since: "0.0.0",
        type: "int",
        category: "gml",
        default: 0,
        range: { start: 0, end: Infinity },
        description:
            "Maximum number of arguments allowed on a single line before a function call is forced to wrap. Set to 0 to disable.",
    },
    applyFeatherFixes: {
        since: "0.0.0",
        type: "boolean",
        category: "gml",
        default: false,
        description:
            "Apply safe auto-fixes derived from GameMaker Feather diagnostics (e.g. remove trailing semicolons from macro declarations flagged by GM1051).",
    }
};

export const defaultOptions = {
    tabWidth: 4,
    semi: true,
    trailingComma: "none",
    printWidth: 120,
    optimizeArrayLengthLoops: true,
    condenseStructAssignments: true,
    arrayLengthHoistFunctionSuffixes: "",
    lineCommentBannerMinimumSlashes: 5,
    lineCommentBannerAutofillThreshold: 4,
    alignAssignmentsMinGroupSize: 3,
    maxParamsPerLine: 0,
    allowSingleLineIfStatements: true,
    preserveGlobalVarStatements: true,
    applyFeatherFixes: false
};

