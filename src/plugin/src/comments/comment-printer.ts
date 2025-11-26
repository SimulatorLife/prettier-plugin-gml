import { Parser } from "@gml-modules/parser";

// Delegate comment printing helpers to the parser package's canonical
// implementation. The plugin facade re-exports these symbols, so keep the
// exported names identical to avoid changing consumer imports.

const handleComments: typeof Parser.handleComments = Parser.handleComments;
const printComment: typeof Parser.printComment = Parser.printComment;
const printDanglingComments: typeof Parser.printDanglingComments =
    Parser.printDanglingComments;
const printDanglingCommentsAsGroup: typeof Parser.printDanglingCommentsAsGroup =
    Parser.printDanglingCommentsAsGroup;

export {
    handleComments,
    printComment,
    printDanglingComments,
    printDanglingCommentsAsGroup
};
