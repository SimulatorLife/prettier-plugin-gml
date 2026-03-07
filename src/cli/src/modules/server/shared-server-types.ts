/**
 * Shared base interfaces for server modules that follow the Interface Segregation Principle.
 *
 * These minimal, role-focused interfaces allow consumers to depend only on the
 * capabilities they actually use, rather than on broad "Controller" contracts.
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
