// gml.js

import GMLParser from "../../parser/src/gml-parser.js";
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
        parse: text => GMLParser.parse(text, {
            getLocations: true,
            simplifyLocations: false
        }),
        astFormat: "gml-ast",
        locStart: (node) => {
            if (!node) {
                return 0;
            }
            if (typeof node.start === "number") {
                return node.start;
            }
            if (node.start && typeof node.start.index === "number") {
                return node.start.index;
            }
            return 0;
        },
        locEnd: (node) => {
            if (!node) {
                return 0;
            }
            const endIndex = typeof node.end === "number"
                ? node.end
                : (node.end && typeof node.end.index === "number" ? node.end.index : undefined);
            if (typeof endIndex === "number") {
                return endIndex + 1;
            }
            const startIndex = typeof node.start === "number"
                ? node.start
                : (node.start && typeof node.start.index === "number" ? node.start.index : 0);
            return startIndex;
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

export const defaultOptions = {
    tabWidth: 4,
    semi: true,
    trailingComma: "none",
    printWidth: 120
};