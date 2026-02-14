import { isDateLike } from "./capability-probes.js";

/**
 * Format a timestamp so only the date portion (YYYY-MM-DD) is returned.
 *
 * @param value Optional numeric timestamp or Date instance to format.
 */
export function formatGeneratedDate(value?: number | Date | null): string {
    const date = value == null ? new Date() : isDateLike(value) ? value : new Date(value);
    const iso = date.toISOString();
    const t = iso.indexOf("T");
    if (t === -1) {
        return iso;
    }

    return iso.slice(0, t);
}
