declare const handleComments: {
    ownLine(comment: any, text: any, options: any, ast: any, isLastComment: any): boolean;
    endOfLine(comment: any, text: any, options: any, ast: any, isLastComment: any): boolean;
    remaining(comment: any, text: any, options: any, ast: any, isLastComment: any): boolean;
};
declare function printComment(commentPath: any, options: any): any;
declare function printDanglingComments(path: any, options: any, filter: any): "" | any[][];
declare function printDanglingCommentsAsGroup(path: any, options: any, filter: any): any[] | "";
export { handleComments, printComment, printDanglingComments, printDanglingCommentsAsGroup };
