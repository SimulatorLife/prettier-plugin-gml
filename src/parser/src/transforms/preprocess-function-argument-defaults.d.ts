import { hasComment as sharedHasComment } from "../comments/index.js";
export declare function preprocessFunctionArgumentDefaults(
    ast: any,
    helpers?: {
        getIdentifierText: any;
        isUndefinedLiteral: any;
        getSingleVariableDeclarator: any;
        hasComment: typeof sharedHasComment;
    }
): any;
export declare const transform: typeof preprocessFunctionArgumentDefaults;
