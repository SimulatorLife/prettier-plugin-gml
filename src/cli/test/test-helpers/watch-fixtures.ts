import { randomUUID } from "node:crypto";
import type { FSWatcher, PathLike, WatchListener, WatchOptions } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export interface WatchTestFixture {
    dir: string;
    script1: string;
    script2: string;
}

export async function createWatchTestFixture(): Promise<WatchTestFixture> {
    const dir = path.join(process.cwd(), "tmp", `watch-test-${Date.now()}-${randomUUID()}`);

    await mkdir(dir, { recursive: true });

    const script1 = path.join(dir, "script1.gml");
    const script2 = path.join(dir, "script2.gml");

    await writeFile(script1, "var x = 10;", "utf8");
    await writeFile(script2, "var y = 20;", "utf8");

    return { dir, script1, script2 };
}

export async function disposeWatchTestFixture(dir: string): Promise<void> {
    await rm(dir, { recursive: true, force: true });
}

export function createMockWatchFactory(listenerCapture?: {
    listener: WatchListener<string> | undefined;
}): (
    path: PathLike,
    options?: WatchOptions | BufferEncoding | "buffer",
    listener?: WatchListener<string>
) => FSWatcher {
    return (
        _path: PathLike,
        _options?: WatchOptions | BufferEncoding | "buffer",
        listener?: WatchListener<string>
    ): FSWatcher => {
        void _path;
        void _options;

        if (listenerCapture) {
            listenerCapture.listener = listener;
        }

        const watcher: FSWatcher = {
            close() {
                return undefined;
            },
            ref() {
                return this;
            },
            unref() {
                return this;
            },
            addListener() {
                return this;
            },
            on() {
                return this;
            },
            once() {
                return this;
            },
            removeListener() {
                return this;
            },
            off() {
                return this;
            },
            removeAllListeners() {
                return this;
            },
            setMaxListeners() {
                return this;
            },
            getMaxListeners() {
                return 0;
            },
            listeners() {
                return [];
            },
            rawListeners() {
                return [];
            },
            emit() {
                return false;
            },
            listenerCount() {
                return 0;
            },
            prependListener() {
                return this;
            },
            prependOnceListener() {
                return this;
            },
            eventNames() {
                return [];
            }
        };

        return watcher;
    };
}
