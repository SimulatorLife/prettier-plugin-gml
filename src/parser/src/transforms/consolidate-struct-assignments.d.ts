export declare function consolidateStructAssignments(ast: any, commentTools: any): any;
declare class CommentTracker {
    constructor(ownerOrComments: any);
    hasBetween(left: any, right: any): boolean;
    hasAfter(position: any): boolean;
    takeBetween(left: any, right: any, predicate: any): any[];
    firstGreaterThan(target: any): number;
    getEntriesBetween(left: any, right: any): any[];
    consumeEntries(entries: any): void;
    removeConsumedComments(): void;
}
export { CommentTracker };
