import { describe, it, expect, afterEach } from "vitest";
import * as net from "node:net";
import { GodotConnection } from "../src/godot-connection.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Create a mock TCP server that responds to JSON Lines requests.
 * Returns the server and its assigned port.
 */
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

    // Listen on port 0 to get a random available port
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

describe("GodotConnection", () => {
  it("sends a request and receives a success response", async () => {
    const { server, port } = await createMockServer((req) => ({
      id: req.id,
      status: "ok",
      data: { result: "hello" },
    }));
    mockServer = server;

    // Create a connection pointing to the mock server port
    const connection = new GodotConnection();
    // Override private fields via any cast for testing
    (connection as any).port = port;

    const result = await connection.send("test_action", { key: "value" });
    expect(result).toEqual({ result: "hello" });
  });

  it("handles error responses from Godot", async () => {
    const { server, port } = await createMockServer((req) => ({
      id: req.id,
      status: "error",
      message: "Something went wrong",
    }));
    mockServer = server;

    const connection = new GodotConnection();
    (connection as any).port = port;

    await expect(connection.send("bad_action")).rejects.toThrow(
      "Something went wrong",
    );
  });

  it("throws connection refused error with helpful message", async () => {
    const connection = new GodotConnection();
    // Use a port that nothing is listening on
    (connection as any).port = 19999;

    await expect(connection.send("test")).rejects.toThrow(
      "Godot is not connected",
    );
  });

  it("includes request id in the request", async () => {
    let receivedId: string | undefined;

    const { server, port } = await createMockServer((req) => {
      receivedId = req.id as string;
      return { id: req.id, status: "ok", data: null };
    });
    mockServer = server;

    const connection = new GodotConnection();
    (connection as any).port = port;

    await connection.send("test");
    expect(receivedId).toBeDefined();
    expect(typeof receivedId).toBe("string");
    expect(receivedId!.length).toBeGreaterThan(0);
  });

  it("includes params in the request", async () => {
    let receivedParams: Record<string, unknown> | undefined;

    const { server, port } = await createMockServer((req) => {
      receivedParams = req.params as Record<string, unknown>;
      return { id: req.id, status: "ok", data: null };
    });
    mockServer = server;

    const connection = new GodotConnection();
    (connection as any).port = port;

    await connection.send("do_something", { foo: "bar", count: 42 });
    expect(receivedParams).toEqual({ foo: "bar", count: 42 });
  });

  it("handles responses with null data", async () => {
    const { server, port } = await createMockServer((req) => ({
      id: req.id,
      status: "ok",
      data: null,
    }));
    mockServer = server;

    const connection = new GodotConnection();
    (connection as any).port = port;

    const result = await connection.send("void_action");
    expect(result).toBeNull();
  });

  it("handles large response data", async () => {
    const largeData = "x".repeat(100000);

    const { server, port } = await createMockServer((req) => ({
      id: req.id,
      status: "ok",
      data: largeData,
    }));
    mockServer = server;

    const connection = new GodotConnection();
    (connection as any).port = port;

    const result = await connection.send("large_data");
    expect(result).toBe(largeData);
  });
});
