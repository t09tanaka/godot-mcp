import * as net from "node:net";
import { randomUUID } from "node:crypto";

// ---- Types ----

export interface GodotRequest {
  id: string;
  action: string;
  params?: Record<string, unknown>;
}

export interface GodotResponse {
  id: string;
  status: "ok" | "error";
  data?: unknown;
  message?: string;
}

// ---- TCP Client ----

/**
 * TCP client that connects to the Godot MCP Bridge plugin.
 * Protocol: JSON Lines (newline-delimited JSON) over TCP.
 * Creates a new TCP connection for each request.
 */
export class GodotConnection {
  private port = 6550;
  private host = "127.0.0.1";
  private timeout = 10000; // 10 seconds

  /**
   * Send a request to Godot and wait for a response.
   * Creates a new TCP connection per request.
   * @throws Error if Godot is not connected or the request fails.
   */
  async send(
    action: string,
    params?: Record<string, unknown>,
  ): Promise<unknown> {
    const request: GodotRequest = {
      id: randomUUID(),
      action,
      params,
    };

    return new Promise<unknown>((resolve, reject) => {
      let buffer = "";
      let settled = false;

      const socket = net.createConnection(
        { host: this.host, port: this.port },
        () => {
          // Connection established - send request as JSON line
          const payload = JSON.stringify(request) + "\n";
          socket.write(payload);
        },
      );

      socket.setTimeout(this.timeout);

      socket.on("data", (chunk: Buffer) => {
        buffer += chunk.toString("utf-8");

        // Look for a complete JSON line (newline-delimited)
        const newlineIndex = buffer.indexOf("\n");
        if (newlineIndex === -1) {
          return; // Wait for more data
        }

        const line = buffer.slice(0, newlineIndex).trim();
        settled = true;
        socket.destroy();

        if (!line) {
          reject(new Error("Empty response from Godot"));
          return;
        }

        try {
          const response: GodotResponse = JSON.parse(line);

          if (response.status === "error") {
            reject(
              new Error(response.message ?? "Unknown error from Godot"),
            );
            return;
          }

          resolve(response.data);
        } catch {
          reject(new Error(`Failed to parse Godot response: ${line}`));
        }
      });

      socket.on("error", (err: NodeJS.ErrnoException) => {
        if (settled) return;
        settled = true;

        if (err.code === "ECONNREFUSED") {
          reject(
            new Error(
              "Godot is not connected. Start the editor and enable the MCP Bridge plugin.",
            ),
          );
        } else {
          reject(
            new Error(`Failed to communicate with Godot: ${err.message}`),
          );
        }
      });

      socket.on("timeout", () => {
        if (settled) return;
        settled = true;
        socket.destroy();
        reject(new Error("Godot request timed out"));
      });

      socket.on("close", () => {
        if (settled) return;
        settled = true;
        reject(new Error("Connection to Godot closed unexpectedly"));
      });
    });
  }
}
