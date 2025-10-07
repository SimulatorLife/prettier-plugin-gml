// gml.js

import GMLParser from "../../parser/src/gml-parser.js";
import { consolidateStructAssignments } from "./ast-transforms/consolidate-struct-assignments.js";
import { print } from "./printer/print.js";
import { handleComments, printComment } from "./printer/comments.js";

function getLocationIndex(node, key) {
    if (!node) {
        return undefined;
    }
    const location = node[key];
    if (typeof location === "number") {
        return location;
    }
    if (location && typeof location.index === "number") {
        return location.index;
    }
    return undefined;
}

function getStartIndex(node) {
    return getLocationIndex(node, "start");
}

function getEndIndex(node) {
    return getLocationIndex(node, "end");
}

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
        parse: text => {
            const ast = GMLParser.parse(text, {
                getLocations: true,
                simplifyLocations: false
            });
            return consolidateStructAssignments(ast);
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
    }
};

export const defaultOptions = {
    tabWidth: 4,
    semi: true,
    trailingComma: "none",
    printWidth: 120,
    optimizeArrayLengthLoops: true
};

