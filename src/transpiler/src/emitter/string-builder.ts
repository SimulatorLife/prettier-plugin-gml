/**
 * Lightweight string builder for efficient transpiler output generation.
 *
 * During hot-reload, the emitter may process hundreds of AST nodes per script.
 * Replacing repeated string concatenation with a pre-allocated buffer reduces
 * allocation overhead and improves compile speed.
 *
 * Performance characteristics:
 * - Pre-allocates a fixed-size buffer to avoid repeated array resizing
 * - Uses array join for final output, which is faster than += in V8
 * - Minimal API surface to keep usage simple and predictable
 *
 * Typical usage in emitter methods:
 *   const builder = new StringBuilder();
 *   builder.append("if (");
 *   builder.append(test);
 *   builder.append(")");
 *   return builder.toString();
 */
export class StringBuilder {
    private readonly parts: string[];
    private count: number;

    /**
     * Create a new StringBuilder with optional capacity hint.
     *
     * @param capacity - Expected number of parts (default: 16)
     */
    constructor(capacity = 16) {
        this.parts = Array.from({ length: capacity });
        this.count = 0;
    }

    /**
     * Append a string to the buffer.
     *
     * @param str - String to append (empty strings are skipped)
     */
    append(str: string): void {
        if (str.length === 0) {
            return;
        }
        if (this.count >= this.parts.length) {
            // Grow by 50% when capacity exceeded (rare in practice)
            this.parts.length = Math.floor(this.parts.length * 1.5);
        }
        this.parts[this.count++] = str;
    }

    /**
     * Append multiple strings to the buffer.
     *
     * @param strings - Array of strings to append
     */
    appendAll(strings: readonly string[]): void {
        for (const str of strings) {
            this.append(str);
        }
    }

    /**
     * Build the final output string.
     *
     * @param separator - Join separator (default: empty string)
     * @returns Combined string from all appended parts
     */
    toString(separator = ""): string {
        return this.parts.slice(0, this.count).join(separator);
    }

    /**
     * Get the current number of parts in the buffer.
     */
    get length(): number {
        return this.count;
    }

    /**
     * Clear the buffer for reuse (avoids allocation).
     */
    clear(): void {
        this.count = 0;
    }
}
