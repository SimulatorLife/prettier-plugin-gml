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
    lineCommentBannerMinimumSlashes: {
        since: "0.0.0",
        type: "int",
        category: "gml",
        default: 5,
        range: { start: 1, end: Infinity },
        description:
            "Minimum number of consecutive '/' characters that must prefix a line comment before it is preserved verbatim."
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
    lineCommentBannerMinimumSlashes: 5
};

