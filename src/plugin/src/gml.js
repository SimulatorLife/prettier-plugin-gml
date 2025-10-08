// gml.js

import GMLParser from "../../parser/src/gml-parser.js";
import { consolidateStructAssignments } from "./ast-transforms/consolidate-struct-assignments.js";
import { print } from "./printer/print.js";
import { handleComments, printComment } from "./printer/comments.js";
import { getStartIndex, getEndIndex } from "../../shared/ast-locations.js";

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
        parse: (text, _parsers, options) => {
            const ast = GMLParser.parse(text, {
                getLocations: true,
                simplifyLocations: false
            });
            if (options?.condenseStructAssignments ?? true) {
                return consolidateStructAssignments(ast);
            }
            return ast;
        },
        astFormat: "gml-ast",
        locStart: (node) => {
            const startIndex = getStartIndex(node);
            return typeof startIndex === "number" ? startIndex : 0;
        },
        locEnd: (node) => {
            const endIndex = getEndIndex(node);
            if (typeof endIndex === "number") {
                return endIndex + 1;
            }
            const startIndex = getStartIndex(node);
            return typeof startIndex === "number" ? startIndex : 0;
        }
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

