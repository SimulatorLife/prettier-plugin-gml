import { Core } from "@gml-modules/core";

export class CommentTracker {
    public comments: Array<unknown>;
    public entries: Array<{
        index: number;
        comment: unknown;
        consumed?: boolean;
    }>;

    private checkpoints: Array<Array<{ index: number; comment: unknown; consumed?: boolean }>> = [];

    constructor(ownerOrComments: unknown) {
        const sourceComments = (() => {
            // If the caller provided a raw array of comments, prefer that
            // directly. Some consumers construct tracker instances with
            // lightweight arrays in tests and transform helpers; using the
            // explicit array avoids ambiguous behaviour when the generic
            // `getCommentArray` helper is invoked with non-program shapes.
            if (Array.isArray(ownerOrComments)) {
                return ownerOrComments;
            }

            {
                const normalized = Core.getCommentArray(ownerOrComments);
                if (Array.isArray(normalized)) {
                    return normalized;
                }
            }

            if (!ownerOrComments || typeof ownerOrComments !== "object") {
                return [];
            }

            const { comments } = ownerOrComments as any;
            return Core.asArray(comments);
        })();
        this.comments = sourceComments;
        this.entries = sourceComments
            .map((comment) => {
                // Prefer the canonical helper but fall back to direct shape
                // inspection when the helper cannot resolve the index. Some
                // test fixtures and early transform phases present bare
                // comment-like objects that still include a `start` index
                // but may not be recognized by the AST helper in all
                // import/resolve contexts. Be conservative and accept both
                // so the tracker remains resilient across consumers.
                // Prefer direct, simple shapes first (tests commonly provide
                // small comment-like objects). Fall back to the canonical
                // helper when the simple shape is not present so the tracker
                // remains tolerant across runtime import contexts.
                let index;
                const maybeStart = comment && (comment as any).start;
                if (maybeStart && typeof maybeStart.index === "number") {
                    index = maybeStart.index;
                } else if (typeof maybeStart === "number") {
                    index = maybeStart;
                } else {
                    index = Core.getNodeStartIndex(comment);
                }
                return { index, comment };
            })
            .filter((entry) => typeof entry.index === "number")
            .sort((a, b) => a.index - b.index);
    }

    checkpoint() {
        this.checkpoints.push(this.entries.map((e) => ({ ...e })));
    }

    rollback() {
        const previous = this.checkpoints.pop();
        if (previous) {
            this.entries = previous;
        }
    }

    commit() {
        this.checkpoints.pop();
    }

    hasBetween(left: number, right: number) {
        if (
            this.entries.length === 0 ||
            left === undefined ||
            right === undefined ||
            left >= right
        ) {
            return false;
        }
        let index = this.firstGreaterThan(left);
        while (index < this.entries.length) {
            const entry = this.entries[index];
            if (entry.index >= right) {
                return false;
            }
            if (!entry.consumed) {
                return true;
            }
            index++;
        }
        return false;
    }

    hasAfter(position: number) {
        if (this.entries.length === 0 || position === undefined) {
            return false;
        }
        let index = this.firstGreaterThan(position);
        while (index < this.entries.length) {
            if (!this.entries[index].consumed) {
                return true;
            }
            index++;
        }
        return false;
    }

    takeBetween(left: number, right: number, predicate?: (comment: unknown) => boolean) {
        if (this.entries.length === 0 || left === undefined) {
            return [];
        }

        const upperBound =
            right === undefined ? Number.POSITIVE_INFINITY : right;
        if (left >= upperBound) {
            return [];
        }

        const results = [];
        const indicesToRemove = [];
        const startIndex = this.firstGreaterThan(left);

        for (let index = startIndex; index < this.entries.length; index++) {
            const entry = this.entries[index];
            if (entry.index >= upperBound) {
                break;
            }

            if (predicate && !predicate(entry.comment)) {
                continue;
            }

            results.push(entry.comment);
            indicesToRemove.push(index);
        }

        for (let i = indicesToRemove.length - 1; i >= 0; i--) {
            this.entries.splice(indicesToRemove[i], 1);
        }

        return results;
    }

    firstGreaterThan(target: number) {
        let low = 0;
        let high = this.entries.length - 1;
        while (low <= high) {
            const mid = (low + high) >> 1;
            if (this.entries[mid].index <= target) {
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }
        return low;
    }

    getEntriesBetween(left: number, right: number) {
        if (
            this.entries.length === 0 ||
            left === undefined ||
            right === undefined ||
            left >= right
        ) {
            return [];
        }

        const startIndex = this.firstGreaterThan(left);
        const collected = [];

        for (let index = startIndex; index < this.entries.length; index++) {
            const entry = this.entries[index];
            if (entry.index >= right) {
                break;
            }
            if (!entry.consumed) {
                collected.push(entry);
            }
        }

        return collected;
    }

    consumeEntries(entries: Array<any>) {
        for (const entry of entries) {
            if (!entry) {
                // Defensive: skip nullish values.
                continue;
            }

            // Support two shapes: callers may pass the internal { index, comment }
            // entry objects (from getEntriesBetween) or raw comment nodes
            // (from takeBetween which returns comments). Handle both so tests
            // and callers behave consistently.
            if (entry && entry.comment) {
                // entry is { index, comment }
                entry.consumed = true;
                if (entry.comment) {
                    (entry.comment)._removedByConsolidation = true;
                }
            } else {
                // entry is a plain comment node
                const commentNode = entry;
                (commentNode)._removedByConsolidation = true;
                // Find the corresponding tracker entry and mark it consumed if present
                for (const e of this.entries) {
                    if (e && e.comment === commentNode) {
                        e.consumed = true;
                        break;
                    }
                }
            }
        }
    }

    removeConsumedComments() {
        if (this.comments.length === 0) {
            return;
        }

        let writeIndex = 0;
        for (let readIndex = 0; readIndex < this.comments.length; readIndex++) {
            const comment = this.comments[readIndex];
            if (comment && (comment as any)._removedByConsolidation) {
                continue;
            }
            this.comments[writeIndex] = comment;
            writeIndex++;
        }

        this.comments.length = writeIndex;
    }
}
