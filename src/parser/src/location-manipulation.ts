import { Core } from "@gml-modules/core";

function adjustLocationProperty(node, propertyName, mapIndex) {
    if (!Object.hasOwn(node, propertyName)) {
        return;
    }

    const location = node[propertyName];

    if (typeof location === "number") {
        node[propertyName] = mapIndex(location);
        return;
    }

    if (!location || typeof location !== "object") {
        return;
    }

    if (typeof location.index === "number") {
        location.index = mapIndex(location.index);
    }
}

export function removeLocationMetadata(target) {
    Core.AST.walkObjectGraph(target, {
        enterObject(node) {
            if (Object.hasOwn(node, "start")) {
                delete node.start;
            }

            if (Object.hasOwn(node, "end")) {
                delete node.end;
            }
        }
    });
}

export function simplifyLocationMetadata(target) {
    Core.AST.walkObjectGraph(target, {
        enterObject(node) {
            if (Object.hasOwn(node, "start")) {
                const start = node.start;
                if (start && typeof start === "object" && "index" in start) {
                    node.start = start.index;
                }
            }

            if (Object.hasOwn(node, "end")) {
                const end = node.end;
                if (end && typeof end === "object" && "index" in end) {
                    node.end = end.index;
                }
            }
        }
    });
}

export function remapLocationMetadata(target, mapIndex) {
    if (typeof mapIndex !== "function") {
        return;
    }

    Core.AST.walkObjectGraph(target, {
        enterObject(node) {
            adjustLocationProperty(node, "start", mapIndex);
            adjustLocationProperty(node, "end", mapIndex);
        }
    });
}
