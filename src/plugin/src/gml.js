// gml.js

import GMLParser from "../../parser/src/gml-parser.js";
import { print } from "./printer/print.js";
import { handleComments, printComment } from "./printer/comments.js";

export const languages = [
    {
        name: "GameMaker Language",
        extensions: [".gml"],
        parsers: ["gml-parse"],
        vscodeLanguageIds: ["gml-gms2"]
    }
];

export const parsers = {
    "gml-parse": {
        parse: text => GMLParser.parse(text, {
            getLocations: true,
            simplifyLocations: false
        }),
        astFormat: "gml-ast",
        locStart: (node) => node.start.index,
        locEnd: (node) => node.end.index + 1
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
    tabWidth: 4
};