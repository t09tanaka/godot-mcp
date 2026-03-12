import { describe, it, expect, afterEach, vi } from "vitest";
import * as net from "node:net";
import { GameConnection } from "../src/game-connection.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createMockServer(
  handler: (request: Record<string, unknown>) => Record<string, unknown>,
): Promise<{ server: net.Server; port: number }> {
  return new Promise((resolve) => {
    const server = net.createServer((socket) => {
      let buffer = "";

      socket.on("data", (chunk) => {
        buffer += chunk.toString("utf-8");
        const newlineIndex = buffer.indexOf("\n");
        if (newlineIndex === -1) return;

        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);

        try {
          const request = JSON.parse(line);
          const response = handler(request);
          socket.write(JSON.stringify(response) + "\n");
        } catch {
          socket.write(
            JSON.stringify({ id: "", status: "error", message: "Parse error" }) +
              "\n",
          );
        }
      });
    });

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as net.AddressInfo;
      resolve({ server, port: addr.port });
    });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let mockServer: net.Server | null = null;

afterEach(() => {
  if (mockServer) {
    mockServer.close();
    mockServer = null;
  }
});

describe("GameConnection", () => {
  it("sends a request and receives a success response", async () => {
    const { server, port } = await createMockServer((req) => ({
      id: req.id,
      status: "ok",
      data: "base64screenshot...",
    }));
    mockServer = server;

    const connection = new GameConnection(port, 0);
    const result = await connection.send("screenshot");
    expect(result).toBe("base64screenshot...");
  });

  it("handles error responses", async () => {
    const { server, port } = await createMockServer((req) => ({
      id: req.id,
      status: "error",
      message: "Could not capture viewport",
    }));
    mockServer = server;

    const connection = new GameConnection(port, 0);
    await expect(connection.send("screenshot")).rejects.toThrow(
      "Could not capture viewport",
    );
  });

  it("throws helpful error when game is not running", async () => {
    const connection = new GameConnection(19998, 0);

    await expect(connection.send("screenshot")).rejects.toThrow(
      "Game is not running",
    );
  });

  it("retries on connection refused before failing", async () => {
    // Start server after a delay to simulate game startup
    let serverStarted = false;
    const serverPromise = createMockServer((req) => ({
      id: req.id,
      status: "ok",
      data: "delayed_result",
    }));

    const { server, port } = await serverPromise;
    mockServer = server;

    // Connection should succeed on first try since server is already up
    const connection = new GameConnection(port, 2, 100);
    const result = await connection.send("screenshot");
    expect(result).toBe("delayed_result");
  });

  it("fails after max retries when game never starts", async () => {
    const connection = new GameConnection(19997, 2, 50);

    await expect(connection.send("screenshot")).rejects.toThrow(
      "Game is not running",
    );
  });
});
