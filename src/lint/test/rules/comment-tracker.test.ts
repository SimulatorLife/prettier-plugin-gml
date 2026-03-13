import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CommentTracker } from "../../src/rules/gml/transforms/comments/comment-tracker.js";

/** Minimal synthetic comment shape used throughout these tests. */
interface TestComment {
    start: number;
    text: string;
}

/** Build a synthetic comment with a numeric start index for test purposes. */
function makeComment(startIndex: number, text = ""): TestComment {
    return { start: startIndex, text };
}

void describe("CommentTracker.takeBetween", () => {
    void it("returns empty array when tracker has no entries", () => {
        const tracker = new CommentTracker([]);
        assert.deepEqual(tracker.takeBetween(0, 100), []);
    });

    void it("returns empty array when left >= right", () => {
        const tracker = new CommentTracker([makeComment(50)]);
        assert.deepEqual(tracker.takeBetween(100, 50), []);
        assert.deepEqual(tracker.takeBetween(50, 50), []);
    });

    void it("extracts comments strictly between left and right", () => {
        const c1 = makeComment(10);
        const c2 = makeComment(20);
        const c3 = makeComment(30);
        const tracker = new CommentTracker([c1, c2, c3]);

        const taken = tracker.takeBetween(5, 25);

        // c1 (index 10) and c2 (index 20) are in (5, 25)
        assert.deepEqual(taken, [c1, c2]);
        // c3 (index 30) remains in tracker
        assert.equal(tracker.entries.length, 1);
        assert.equal((tracker.entries[0].comment as TestComment).start, 30);
    });

    void it("does not include comments at exact boundary positions", () => {
        const cLeft = makeComment(10);
        const cInside = makeComment(20);
        const cRight = makeComment(30);
        const tracker = new CommentTracker([cLeft, cInside, cRight]);

        // left=10 means "strictly greater than 10"; right=30 means "strictly less than 30"
        const taken = tracker.takeBetween(10, 30);

        assert.deepEqual(taken, [cInside]);
        assert.equal(tracker.entries.length, 2);
    });

    void it("removes extracted comments from tracker entries", () => {
        const c1 = makeComment(5);
        const c2 = makeComment(15);
        const c3 = makeComment(25);
        const tracker = new CommentTracker([c1, c2, c3]);

        tracker.takeBetween(0, 20);

        // Only c3 (index 25) should remain
        assert.equal(tracker.entries.length, 1);
        assert.equal((tracker.entries[0].comment as TestComment).start, 25);
    });

    void it("applies predicate to filter extracted comments", () => {
        const c1 = makeComment(10, "keep");
        const c2 = makeComment(20, "skip");
        const c3 = makeComment(30, "keep");
        const tracker = new CommentTracker([c1, c2, c3]);

        const taken = tracker.takeBetween(5, 100, (c) => (c as TestComment).text === "keep");

        assert.deepEqual(taken, [c1, c3]);
        // c2 (failed predicate) stays in tracker
        assert.equal(tracker.entries.length, 1);
        assert.equal((tracker.entries[0].comment as TestComment).text, "skip");
    });

    void it("keeps entries before and after the range intact", () => {
        const before = makeComment(1);
        const inside = makeComment(50);
        const after = makeComment(99);
        const tracker = new CommentTracker([before, inside, after]);

        const taken = tracker.takeBetween(10, 90);

        assert.deepEqual(taken, [inside]);
        assert.equal(tracker.entries.length, 2);
        assert.equal((tracker.entries[0].comment as TestComment).start, 1);
        assert.equal((tracker.entries[1].comment as TestComment).start, 99);
    });

    void it("returns empty array when no comments fall within range", () => {
        const tracker = new CommentTracker([makeComment(5), makeComment(95)]);

        const taken = tracker.takeBetween(10, 90);

        assert.deepEqual(taken, []);
        assert.equal(tracker.entries.length, 2);
    });

    void it("extracts all comments when called with infinite upper bound", () => {
        const c1 = makeComment(10);
        const c2 = makeComment(20);
        const tracker = new CommentTracker([c1, c2]);

        const taken = tracker.takeBetween(5, Number.POSITIVE_INFINITY);

        assert.deepEqual(taken, [c1, c2]);
        assert.equal(tracker.entries.length, 0);
    });
});

void describe("CommentTracker checkpoint / rollback / commit", () => {
    void it("rollback restores entries to the checkpointed state", () => {
        const c1 = makeComment(10);
        const c2 = makeComment(20);
        const tracker = new CommentTracker([c1, c2]);

        tracker.checkpoint();
        tracker.takeBetween(5, 25); // remove both
        assert.equal(tracker.entries.length, 0);

        tracker.rollback();
        assert.equal(tracker.entries.length, 2);
    });

    void it("commit discards the checkpoint so rollback has no effect", () => {
        const c1 = makeComment(10);
        const tracker = new CommentTracker([c1]);

        tracker.checkpoint();
        tracker.takeBetween(5, 100);
        tracker.commit(); // accept the mutation

        // A subsequent rollback should have no saved state to restore
        tracker.rollback(); // no-op: stack is empty
        assert.equal(tracker.entries.length, 0);
    });
});
