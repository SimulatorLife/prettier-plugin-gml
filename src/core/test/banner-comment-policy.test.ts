import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import {
    evaluateBannerCommentPolicy,
    isBelowBannerSlashThreshold,
    DEFAULT_BANNER_COMMENT_POLICY_CONFIG,
    type BannerCommentPolicyContext
} from "../src/comments/line-comment/banner-comment-policy.js";

describe("banner-comment-policy", () => {
    describe("evaluateBannerCommentPolicy", () => {
        it("should identify banner comments with 4+ leading slashes on their own line", () => {
            const context: BannerCommentPolicyContext = {
                leadingSlashCount: 4,

                hasDecorations: false
            };

            const result = evaluateBannerCommentPolicy(context);

            assert.equal(result.isBanner, true);
            assert.equal(result.reason, "sufficient-leading-slashes");
        });

        it("should identify banner comments with 5+ leading slashes", () => {
            const context: BannerCommentPolicyContext = {
                leadingSlashCount: 10,

                hasDecorations: false
            };

            const result = evaluateBannerCommentPolicy(context);

            assert.equal(result.isBanner, true);
            assert.equal(result.reason, "sufficient-leading-slashes");
        });

        it("should identify banner comments with decorations even if slash count is low", () => {
            const context: BannerCommentPolicyContext = {
                leadingSlashCount: 2,

                hasDecorations: true
            };

            const result = evaluateBannerCommentPolicy(context);

            assert.equal(result.isBanner, true);
            assert.equal(result.reason, "has-decorations");
        });

        it("should reject regular comments with insufficient slashes and no decorations", () => {
            const context: BannerCommentPolicyContext = {
                leadingSlashCount: 2,

                hasDecorations: false
            };

            const result = evaluateBannerCommentPolicy(context);

            assert.equal(result.isBanner, false);
            assert.equal(result.reason, "insufficient-criteria");
        });

        it("should reject doc-style comments with 3 slashes", () => {
            const context: BannerCommentPolicyContext = {
                leadingSlashCount: 3,

                hasDecorations: false
            };

            const result = evaluateBannerCommentPolicy(context);

            assert.equal(result.isBanner, false);
            assert.equal(result.reason, "insufficient-criteria");
        });

        it("should respect custom policy configuration with higher threshold", () => {
            const context: BannerCommentPolicyContext = {
                leadingSlashCount: 5,

                hasDecorations: false
            };

            const customConfig = { minLeadingSlashes: 6 };
            const result = evaluateBannerCommentPolicy(context, customConfig);

            assert.equal(result.isBanner, false);
            assert.equal(result.reason, "insufficient-criteria");
        });

        it("should respect custom policy configuration with lower threshold", () => {
            const context: BannerCommentPolicyContext = {
                leadingSlashCount: 3,

                hasDecorations: false
            };

            const customConfig = { minLeadingSlashes: 3 };
            const result = evaluateBannerCommentPolicy(context, customConfig);

            assert.equal(result.isBanner, true);
            assert.equal(result.reason, "sufficient-leading-slashes");
        });

        it("should identify banners with decorations at exactly the default threshold", () => {
            const context: BannerCommentPolicyContext = {
                leadingSlashCount: 4,

                hasDecorations: true
            };

            const result = evaluateBannerCommentPolicy(context);

            assert.equal(result.isBanner, true);
            assert.equal(result.reason, "sufficient-leading-slashes");
        });

        it("should handle edge case: exactly at threshold minus one with decorations", () => {
            const context: BannerCommentPolicyContext = {
                leadingSlashCount: 3,

                hasDecorations: true
            };

            const result = evaluateBannerCommentPolicy(context);

            assert.equal(result.isBanner, true);
            assert.equal(result.reason, "has-decorations");
        });
    });

    describe("isBelowBannerSlashThreshold", () => {
        it("should return true for slash counts below the default threshold", () => {
            assert.equal(isBelowBannerSlashThreshold(0), true);
            assert.equal(isBelowBannerSlashThreshold(1), true);
            assert.equal(isBelowBannerSlashThreshold(2), true);
            assert.equal(isBelowBannerSlashThreshold(3), true);
        });

        it("should return false for slash counts at or above the default threshold", () => {
            assert.equal(isBelowBannerSlashThreshold(4), false);
            assert.equal(isBelowBannerSlashThreshold(5), false);
            assert.equal(isBelowBannerSlashThreshold(10), false);
            assert.equal(isBelowBannerSlashThreshold(100), false);
        });

        it("should respect custom threshold configuration", () => {
            const customConfig = { minLeadingSlashes: 6 };

            assert.equal(isBelowBannerSlashThreshold(5, customConfig), true);
            assert.equal(isBelowBannerSlashThreshold(6, customConfig), false);
            assert.equal(isBelowBannerSlashThreshold(7, customConfig), false);
        });

        it("should handle threshold of 2", () => {
            const customConfig = { minLeadingSlashes: 2 };

            assert.equal(isBelowBannerSlashThreshold(1, customConfig), true);
            assert.equal(isBelowBannerSlashThreshold(2, customConfig), false);
            assert.equal(isBelowBannerSlashThreshold(3, customConfig), false);
        });
    });

    describe("DEFAULT_BANNER_COMMENT_POLICY_CONFIG", () => {
        it("should have a minimum leading slashes threshold of 4", () => {
            assert.equal(DEFAULT_BANNER_COMMENT_POLICY_CONFIG.minLeadingSlashes, 4);
        });

        it("should be frozen (immutable)", () => {
            assert.equal(Object.isFrozen(DEFAULT_BANNER_COMMENT_POLICY_CONFIG), true);
        });
    });

    describe("policy integration scenarios", () => {
        it("should correctly handle a typical decorative banner comment", () => {
            const context: BannerCommentPolicyContext = {
                leadingSlashCount: 20,

                hasDecorations: true
            };

            const result = evaluateBannerCommentPolicy(context);

            assert.equal(result.isBanner, true);
        });

        it("should correctly handle a minimal valid line comment", () => {
            const context: BannerCommentPolicyContext = {
                leadingSlashCount: 2,

                hasDecorations: false
            };

            const result = evaluateBannerCommentPolicy(context);

            assert.equal(result.isBanner, false);
        });

        it("should correctly handle doc comments", () => {
            const context: BannerCommentPolicyContext = {
                leadingSlashCount: 3,
                hasDecorations: false
            };

            const result = evaluateBannerCommentPolicy(context);

            assert.equal(result.isBanner, false);
        });
    });
});
