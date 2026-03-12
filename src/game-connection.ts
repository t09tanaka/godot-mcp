import { GodotConnection } from "./godot-connection.js";

/**
 * TCP client for the game-side MCP Game Bridge autoload.
 * Connects to port 6551 where the running game listens.
 * Includes retry logic since the game process takes time to start.
 */
export class GameConnection {
  private connection: GodotConnection;
  private maxRetries: number;
  private retryDelay: number;

  constructor(port = 6551, maxRetries = 3, retryDelay = 500) {
    this.connection = new GodotConnection(port);
    this.maxRetries = maxRetries;
    this.retryDelay = retryDelay;
  }

  /**
   * Send a request to the running game with automatic retry.
   * Retries on connection refused since the game may still be starting.
   */
  async send(
    action: string,
    params?: Record<string, unknown>,
  ): Promise<unknown> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.connection.send(action, params);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        // Only retry on connection refused (game not ready yet)
        const isConnectionRefused = lastError.message.includes("not connected");

        if (!isConnectionRefused) {
          // Application-level error from the game — propagate as-is
          throw lastError;
        }

        if (attempt >= this.maxRetries) {
          throw new Error(
            `Game is not running or MCP Game Bridge is not loaded. ` +
            `Run the project first and ensure the MCP Bridge plugin is enabled.`,
          );
        }

        await new Promise((resolve) => setTimeout(resolve, this.retryDelay));
      }
    }

    throw lastError;
  }
}
