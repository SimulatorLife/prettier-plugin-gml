import * as Parser from "@gml-modules/parser";
export declare const handleComments: {
    ownLine(comment: any, text: any, options: any, ast: any, isLastComment: any): boolean;
    endOfLine(comment: any, text: any, options: any, ast: any, isLastComment: any): boolean;
    remaining(comment: any, text: any, options: any, ast: any, isLastComment: any): boolean;
};
export declare const printComment: typeof Parser.Comments.printComment;
export declare const printDanglingComments: typeof Parser.Comments.printDanglingComments;
export declare const printDanglingCommentsAsGroup: typeof Parser.Comments.printDanglingCommentsAsGroup;
