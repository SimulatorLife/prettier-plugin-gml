import { Buffer } from "node:buffer";

import { formatByteSize as sharedFormatByteSize } from "./shared/number-utils.js";

/**
 * Format UTF-8 text size using the shared byte formatter. The helper previously
 * lived in the shared number utilities even though it relies on Node's
 * `Buffer` API, which is only available in the CLI/runtime tooling layer.
 * Co-locating it with the rest of the CLI byte helpers keeps the shared bundle
 * environment-agnostic while preserving the existing ergonomics for command
 * modules.
 *
 * @param {string} text Text to measure.
 * @returns {string} Human-readable byte size string.
 */
function formatBytes(text) {
    const size = Buffer.byteLength(text, "utf8");
    return sharedFormatByteSize(size, { decimals: 1 });
}

export { formatBytes };

export { formatByteSize } from "./shared/number-utils.js";
