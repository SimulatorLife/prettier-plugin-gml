import { appendFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { Core } from "@gmloop/core";

export type IdentifierSinkRole = "declarations" | "references";

export type IdentifierSinkRecord = {
    collection: string;
    key: string;
    role: IdentifierSinkRole;
    payload: unknown;
};

export interface IdentifierSink {
    append(record: IdentifierSinkRecord): void;
    readAll(collection: string, key: string, role: IdentifierSinkRole): Array<unknown>;
    getRetainedEntriesPerKey(): number;
    getStats(): {
        recordsAppended: number;
        recordsSpilled: number;
        spillFiles: number;
        cacheHits: number;
        cacheMisses: number;
    };
    dispose(): void;
}

type LruCacheEntry = {
    key: string;
    records: Array<unknown>;
};

type TempFileIdentifierSinkOptions = {
    enabled?: boolean;
    flushThreshold?: number;
    retainedEntriesPerKey?: number;
    readCacheMaxEntries?: number;
    tempDirectoryPrefix?: string;
};

const DEFAULT_FLUSH_THRESHOLD = 128;
const DEFAULT_RETAINED_ENTRIES_PER_KEY = 32;
const DEFAULT_READ_CACHE_MAX_ENTRIES = 32;

function createRecordKey(collection: string, key: string, role: IdentifierSinkRole): string {
    return `${collection}\u0000${key}\u0000${role}`;
}

function normalizeCount(value: unknown, fallback: number): number {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
        return fallback;
    }

    return Math.floor(value);
}

function escapeKeySegment(value: string): string {
    return value.replaceAll(/[^a-zA-Z0-9_.-]/g, "_");
}

function parseJsonLines(rawContents: string): Array<unknown> {
    if (rawContents.length === 0) {
        return [];
    }

    const lines = rawContents.split("\n");
    const records: Array<unknown> = [];
    for (const line of lines) {
        if (line.length === 0) {
            continue;
        }

        records.push(JSON.parse(line));
    }

    return records;
}

/**
 * Temporary-file-backed identifier sink that keeps a bounded in-memory tail for
 * duplicate checks and spills historical records to JSONL files.
 */
export class TempFileIdentifierSink implements IdentifierSink {
    private readonly enabled: boolean;
    private readonly flushThreshold: number;
    private readonly retainedEntriesPerKey: number;
    private readonly readCacheMaxEntries: number;
    private readonly tempRootPath: string | null;
    private readonly inMemoryTailByKey = new Map<string, Array<unknown>>();
    private readonly filePathByKey = new Map<string, string>();
    private readonly parsedReadCacheByPath = new Map<string, LruCacheEntry>();
    private recordsAppended = 0;
    private recordsSpilled = 0;
    private spillFiles = 0;
    private cacheHits = 0;
    private cacheMisses = 0;

    constructor(options: TempFileIdentifierSinkOptions = {}) {
        this.enabled = options.enabled ?? false;
        this.flushThreshold = normalizeCount(options.flushThreshold, DEFAULT_FLUSH_THRESHOLD);
        this.retainedEntriesPerKey = normalizeCount(options.retainedEntriesPerKey, DEFAULT_RETAINED_ENTRIES_PER_KEY);
        this.readCacheMaxEntries = normalizeCount(options.readCacheMaxEntries, DEFAULT_READ_CACHE_MAX_ENTRIES);

        if (this.enabled) {
            const prefix = options.tempDirectoryPrefix ?? "gmloop-identifier-sink-";
            this.tempRootPath = mkdtempSync(path.join(os.tmpdir(), prefix));
            return;
        }

        this.tempRootPath = null;
    }

    append(record: IdentifierSinkRecord): void {
        if (!this.enabled) {
            return;
        }

        const recordKey = createRecordKey(record.collection, record.key, record.role);
        const tail = Core.getOrCreateMapEntry(this.inMemoryTailByKey, recordKey, () => []);
        tail.push(record.payload);
        this.recordsAppended += 1;

        if (tail.length < this.flushThreshold) {
            return;
        }

        const spillCount = Math.max(0, tail.length - this.retainedEntriesPerKey);
        if (spillCount === 0) {
            return;
        }

        const spillRecords = tail.splice(0, spillCount);
        this.appendRecordsToFile(recordKey, spillRecords);
    }

    readAll(collection: string, key: string, role: IdentifierSinkRole): Array<unknown> {
        const recordKey = createRecordKey(collection, key, role);
        const tailRecords = this.inMemoryTailByKey.get(recordKey) ?? [];

        if (!this.enabled) {
            return [...tailRecords];
        }

        const filePath = this.filePathByKey.get(recordKey);
        if (!filePath) {
            return [...tailRecords];
        }

        const spilledRecords = this.readSpilledRecords(filePath);
        return [...spilledRecords, ...tailRecords];
    }

    getRetainedEntriesPerKey(): number {
        return this.retainedEntriesPerKey;
    }

    getStats() {
        return {
            recordsAppended: this.recordsAppended,
            recordsSpilled: this.recordsSpilled,
            spillFiles: this.spillFiles,
            cacheHits: this.cacheHits,
            cacheMisses: this.cacheMisses
        };
    }

    dispose(): void {
        this.inMemoryTailByKey.clear();
        this.filePathByKey.clear();
        this.parsedReadCacheByPath.clear();

        if (!this.enabled || !this.tempRootPath) {
            return;
        }

        rmSync(this.tempRootPath, { recursive: true, force: true });
    }

    private appendRecordsToFile(recordKey: string, records: Array<unknown>): void {
        if (!this.enabled || records.length === 0 || !this.tempRootPath) {
            return;
        }

        let filePath = this.filePathByKey.get(recordKey);
        if (!filePath) {
            filePath = path.join(this.tempRootPath, `${escapeKeySegment(recordKey)}.jsonl`);
            this.filePathByKey.set(recordKey, filePath);
            this.spillFiles += 1;
        }

        const payload = `${records.map((value) => JSON.stringify(value)).join("\n")}\n`;
        appendFileSync(filePath, payload, "utf8");
        this.recordsSpilled += records.length;

        // Invalidate read cache because the file grew.
        this.parsedReadCacheByPath.delete(filePath);
    }

    private readSpilledRecords(filePath: string): Array<unknown> {
        const cached = this.parsedReadCacheByPath.get(filePath);
        if (cached) {
            this.cacheHits += 1;
            this.promoteReadCacheEntry(filePath, cached);
            return cached.records;
        }

        this.cacheMisses += 1;
        const rawContents = readFileSync(filePath, "utf8");
        const records = parseJsonLines(rawContents);
        this.promoteReadCacheEntry(filePath, {
            key: filePath,
            records
        });

        return records;
    }

    private promoteReadCacheEntry(cacheKey: string, entry: LruCacheEntry): void {
        this.parsedReadCacheByPath.delete(cacheKey);
        this.parsedReadCacheByPath.set(cacheKey, entry);

        while (this.parsedReadCacheByPath.size > this.readCacheMaxEntries) {
            const oldestKey = this.parsedReadCacheByPath.keys().next().value;
            if (!oldestKey) {
                break;
            }

            this.parsedReadCacheByPath.delete(oldestKey);
        }
    }
}

export function createIdentifierSink(options: TempFileIdentifierSinkOptions = {}): IdentifierSink {
    return new TempFileIdentifierSink({
        ...options,
        enabled: options.enabled ?? true
    });
}
