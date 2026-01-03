import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export interface WatchTestFixture {
    dir: string;
    script1: string;
    script2: string;
}

export async function createWatchTestFixture(): Promise<WatchTestFixture> {
    const dir = path.join(process.cwd(), "tmp", `watch-test-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);

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
