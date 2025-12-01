
import { convertLegacyReturnsDescriptionLinesToMetadata, normalizeGameMakerType } from "./src/comments/doc-comment-service.js";

const input = [
    "/// @function has_feature",
    "///              Returns: Boolean, indicating whether conversion occurs"
];

const output = convertLegacyReturnsDescriptionLinesToMetadata(input, {
    normalizeDocCommentTypeAnnotations: normalizeGameMakerType
});

console.log(JSON.stringify(output, null, 2));
