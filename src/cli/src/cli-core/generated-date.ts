export function formatGeneratedDate(value?: number | Date | null): string {
    const date = value == null ? new Date() : value instanceof Date ? value : new Date(value);
    const iso = date.toISOString();
    const t = iso.indexOf("T");
    return t >= 0 ? iso.slice(0, t) : iso;
}
