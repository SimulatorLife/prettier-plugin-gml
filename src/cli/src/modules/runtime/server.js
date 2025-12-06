import http from "node:http";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import { isFsErrorCode } from "../dependencies.js";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 0;
const MIME_TYPES = new Map([
    [".html", "text/html; charset=utf-8"],
    [".js", "application/javascript; charset=utf-8"],
    [".mjs", "application/javascript; charset=utf-8"],
    [".json", "application/json; charset=utf-8"],
    [".css", "text/css; charset=utf-8"],
    [".svg", "image/svg+xml"],
    [".png", "image/png"],
    [".jpg", "image/jpeg"],
    [".jpeg", "image/jpeg"],
    [".gif", "image/gif"],
    [".wasm", "application/wasm"],
    [".txt", "text/plain; charset=utf-8"],
    [".ico", "image/x-icon"]
]);

function resolveMimeType(filePath) {
    const extension = path.extname(filePath).toLowerCase();
    return MIME_TYPES.get(extension) ?? "application/octet-stream";
}

function normalizeRequestPath(requestUrl) {
    if (typeof requestUrl !== "string" || requestUrl.length === 0) {
        return "/";
    }

    const queryIndex = requestUrl.indexOf("?");
    if (queryIndex === -1) {
        return requestUrl;
    }

    const pathOnly = requestUrl.slice(0, queryIndex);
    return pathOnly.length === 0 ? "/" : pathOnly;
}

function resolveRuntimeFilePath(root, requestPath) {
    let decoded;
    try {
        decoded = decodeURIComponent(requestPath);
    } catch {
        throw Object.assign(new Error("Malformed request path."), {
            statusCode: 400
        });
    }
    const sanitizedPath = decoded.replaceAll("\\", "/");
    const sanitizedSegments = sanitizedPath
        .split("/")
        .filter((segment) => segment && segment !== ".");

    if (sanitizedSegments.includes("..")) {
        throw Object.assign(
            new Error("Request path resolves outside runtime root."),
            {
                statusCode: 403
            }
        );
    }
    const normalizedPath = path.normalize(decoded).replaceAll("\\", "/");
    const strippedPath = normalizedPath.startsWith("/")
        ? normalizedPath.slice(1)
        : normalizedPath;
    const candidate = strippedPath.length === 0 ? "." : strippedPath;
    const target = path.resolve(root, candidate);
    const relative = path.relative(root, target);

    if (relative.startsWith("..") || path.isAbsolute(relative)) {
        throw Object.assign(
            new Error("Request path resolves outside runtime root."),
            {
                statusCode: 403
            }
        );
    }

    return target;
}

async function sendFileResponse(res, filePath, { method }) {
    const stats = await fs.stat(filePath);
    let servingPath = filePath;

    if (stats.isDirectory()) {
        servingPath = path.join(filePath, "index.html");
    }

    const fileStats = await fs.stat(servingPath);

    if (!fileStats.isFile()) {
        throw Object.assign(new Error("Requested resource is not a file."), {
            statusCode: 404
        });
    }

    const mimeType = resolveMimeType(servingPath);
    res.statusCode = 200;
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Cache-Control", "no-store");

    if (method === "HEAD") {
        res.end();
        return;
    }

    await new Promise((resolve, reject) => {
        const stream = createReadStream(servingPath);
        stream.on("error", reject);
        stream.on("close", resolve);
        stream.pipe(res);
    });
}

function writeError(res, statusCode, message) {
    res.statusCode = statusCode;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end(message);
}

export async function startRuntimeStaticServer({
    runtimeRoot,
    host = DEFAULT_HOST,
    port = DEFAULT_PORT,
    verbose = false
} = {}) {
    if (!runtimeRoot || typeof runtimeRoot !== "string") {
        throw new TypeError(
            "startRuntimeStaticServer requires a runtimeRoot string."
        );
    }

    const resolvedRoot = path.resolve(runtimeRoot);

    const initialStats = await fs.stat(resolvedRoot).catch((error) => {
        if (isFsErrorCode(error, "ENOENT")) {
            throw new Error(
                `Runtime root '${resolvedRoot}' does not exist. Did hydration succeed?`
            );
        }
        throw error;
    });

    if (!initialStats.isDirectory()) {
        throw new Error(`Runtime root '${resolvedRoot}' is not a directory.`);
    }

    const activeSockets = new Set();

    const server = http.createServer((req, res) => {
        const method = req.method ?? "GET";
        if (method !== "GET" && method !== "HEAD") {
            writeError(res, 405, "Method Not Allowed");
            return;
        }

        const requestPath = normalizeRequestPath(req.url ?? "/");
        let targetPath;

        try {
            targetPath = resolveRuntimeFilePath(resolvedRoot, requestPath);
        } catch (error) {
            const statusCode = error?.statusCode ?? 500;
            const message =
                statusCode === 403
                    ? "Forbidden"
                    : error instanceof Error
                      ? error.message
                      : "Internal Server Error";
            writeError(res, statusCode, message);
            return;
        }

        if (targetPath.endsWith(path.sep)) {
            targetPath = targetPath.slice(0, -1);
        }

        sendFileResponse(res, targetPath, { method }).catch((error) => {
            if (isFsErrorCode(error, "ENOENT")) {
                writeError(res, 404, "Not Found");
                return;
            }

            const message =
                error instanceof Error ? error.message : String(error);
            writeError(res, 500, `Failed to read runtime asset: ${message}`);
        });
    });

    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen({ host, port }, () => {
            server.off("error", reject);
            resolve();
        });
    });

    server.on("connection", (socket) => {
        activeSockets.add(socket);
        socket.on("close", () => {
            activeSockets.delete(socket);
        });
    });

    const address = server.address();
    if (!address || typeof address !== "object" || !("port" in address)) {
        await new Promise((resolve, reject) => {
            server.close((error) => {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        });

        throw new Error("Failed to determine runtime static server address.");
    }

    const resolvedHost = host ?? DEFAULT_HOST;
    const resolvedPort = address.port;
    const origin = `http://${resolvedHost}:${resolvedPort}`;

    if (verbose) {
        console.log(`Serving HTML5 runtime from ${resolvedRoot} at ${origin}`);
    }

    let closed = false;

    async function stop() {
        if (closed) {
            return;
        }
        closed = true;

        for (const socket of activeSockets) {
            socket.destroy();
        }
        await new Promise((resolve, reject) => {
            server.close((error) => {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        });
    }

    return {
        url: `${origin}/`,
        origin,
        host: resolvedHost,
        port: resolvedPort,
        root: resolvedRoot,
        stop
    };
}
