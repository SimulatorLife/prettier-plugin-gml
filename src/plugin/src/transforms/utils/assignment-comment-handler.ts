import { Core, type MutableGameMakerAstNode } from "@gml-modules/core";
import type { CommentTracker } from "./comment-tracker.js";

type CommentTools = {
    addTrailingComment: (...args: Array<unknown>) => unknown;
};

export class AssignmentCommentHandler {
    allowTrailingCommentsBetween(
        tracker: CommentTracker,
        left: number | undefined,
        right: number | undefined,
        precedingStatement: MutableGameMakerAstNode | null,
        precedingProperty: MutableGameMakerAstNode | null,
        commentTools: CommentTools
    ): boolean {
        const commentEntries = tracker.getEntriesBetween(left, right);
        if (commentEntries.length === 0) {
            return true;
        }

        if (!precedingStatement) {
            return false;
        }

        const expectedLine = Core.getNodeEndLine(precedingStatement);
        if (typeof expectedLine !== "number") {
            return false;
        }

        if (commentEntries.some(({ comment }) => !this.isTrailingLineCommentOnLine(comment, expectedLine))) {
            return false;
        }

        const commentTarget = precedingProperty ? (precedingProperty.value ?? precedingProperty) : null;
        for (const { comment } of commentEntries) {
            if (comment.leadingChar === ";") {
                comment.leadingChar = ",";
            }

            if (commentTarget) {
                comment.enclosingNode = commentTarget;
                commentTools.addTrailingComment(commentTarget, comment);
            }
        }

        if (commentTarget) {
            precedingProperty._hasTrailingInlineComment = true;
        }

        tracker.consumeEntries(commentEntries);
        return true;
    }

    isTrailingLineCommentOnLine(comment: unknown, expectedLine: number): boolean {
        if (!Core.isLineComment(comment)) {
            return false;
        }

        return Core.getNodeStartLine(comment) === expectedLine;
    }

    isAttachableTrailingComment(comment: unknown, statement: MutableGameMakerAstNode): boolean {
        if (!Core.isLineComment(comment)) {
            return false;
        }

        const commentStart = (comment as any).start;
        if (!Core.isObjectLike(commentStart) || typeof commentStart.line !== "number") {
            return false;
        }

        const statementEndLine = Core.getNodeEndLine(statement);
        if (typeof statementEndLine !== "number") {
            return false;
        }

        if (commentStart.line !== statementEndLine) {
            return false;
        }

        const commentStartIndex = Core.getNodeStartIndex(comment);
        const statementEndIndex = Core.getNodeEndIndex(statement);
        if (
            typeof commentStartIndex === "number" &&
            typeof statementEndIndex === "number" &&
            commentStartIndex <= statementEndIndex
        ) {
            return false;
        }

        return true;
    }
}
