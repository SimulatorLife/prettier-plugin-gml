/**
 * Tracks comment ranges so transforms can temporarily re-order or remove statements without losing annotations.
 */
import { Core } from "@gml-modules/core";

/**
 * Keeps a sorted view of comment locations and supports checkpoint/rollback to safely explore rewrites.
 */
export class CommentTracker {
    public comments: Array<unknown>;
    public entries: Array<{
        index: number;
        comment: unknown;
        consumed?: boolean;
    }>;

    private checkpoints: Array<Array<{ index: number; comment: unknown; consumed?: boolean }>> = [];

    constructor(ownerOrComments: unknown) {
        // Extract comments from either a raw array or an AST node
        const sourceComments: readonly unknown[] = Array.isArray(ownerOrComments)
            ? ownerOrComments
            : Core.getCommentArray(ownerOrComments);

        this.comments = sourceComments as Array<unknown>;
        this.entries = sourceComments
            .map((comment) => {
                // Extract index from comment.start (number or {index: number})
                const maybeStart = (comment as any)?.start;
                const index =
                    typeof maybeStart === "number"
                        ? maybeStart
                        : maybeStart && typeof maybeStart.index === "number"
                          ? maybeStart.index
                          : Core.getNodeStartIndex(comment);
                return { index, comment };
            })
            .filter((entry) => typeof entry.index === "number")
            .sort((a, b) => a.index - b.index);
    }

    // Save the current comment state so we can revert if a rewrite branch fails.
    checkpoint() {
        this.checkpoints.push(this.entries.map((e) => ({ ...e })));
    }

    // Revert to the last checkpoint when the pending rewrite should be discarded.
    rollback() {
        const previous = this.checkpoints.pop();
        if (previous) {
            this.entries = previous;
        }
    }

    // Forget the most recent checkpoint when a rewrite succeeds.
    commit() {
        this.checkpoints.pop();
    }

    hasBetween(left: number, right: number) {
        if (this.entries.length === 0 || left === undefined || right === undefined || left >= right) {
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

    // Retrieve and remove entries between the provided indices for relocation.
    takeBetween(left: number, right: number, predicate?: (comment: unknown) => boolean) {
        if (this.entries.length === 0 || left === undefined) {
            return [];
        }

        const upperBound = right === undefined ? Number.POSITIVE_INFINITY : right;
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

    // Binary search helper used to find the next comment index beyond the provided offset.
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

    // Peek at entries between two offsets without mutating the tracker state.
    getEntriesBetween(left: number, right: number) {
        if (this.entries.length === 0 || left === undefined || right === undefined || left >= right) {
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
        // Mark the supplied entries as consumed so they are skipped when re-serializing comments.
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
                    entry.comment._removedByConsolidation = true;
                }
            } else {
                // entry is a plain comment node
                const commentNode = entry;
                commentNode._removedByConsolidation = true;
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
        // Drop comments that were marked as consumed during consolidation so the printer ignores them.
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
