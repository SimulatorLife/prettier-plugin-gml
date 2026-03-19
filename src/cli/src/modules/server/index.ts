/**
 * Shared server contracts used by the CLI's HTTP and WebSocket modules.
 *
 * Keeping these types at the directory export surface avoids a fragmented
 * single-purpose leaf module and makes the server concept easier to discover.
 */

/**
 * Network endpoint information for a running server.
 *
 * Provides address and URL details needed for logging, diagnostics,
 * and client connection without coupling to lifecycle or domain operations.
 */
export interface ServerEndpoint {
    readonly url: string;
    readonly host: string;
    readonly port: number;
}

/**
 * Lifecycle management for a running server.
 *
 * Provides clean shutdown capability without coupling to endpoint
 * information or domain-specific operations.
 */
export interface ServerLifecycle {
    stop(): Promise<void>;
}
