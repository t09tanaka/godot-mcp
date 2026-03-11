import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock GodotConnection before importing runtime-tools
vi.mock("../src/godot-connection.js", () => {
  const mockSend = vi.fn();
  return {
    GodotConnection: vi.fn().mockImplementation(() => ({
      send: mockSend,
    })),
    __mockSend: mockSend,
  };
});

// Import after mock setup
import {
  screenshot,
  runProject,
  stopProject,
  getDebugLog,
  getSceneTreeLive,
} from "../src/runtime-tools.js";

// Access the mock send function
import * as connectionModule from "../src/godot-connection.js";
const mockSend = (connectionModule as any).__mockSend as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockSend.mockReset();
});

describe("screenshot", () => {
  it("calls send with 'screenshot' action and returns base64 string", async () => {
    const fakeBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB...";
    mockSend.mockResolvedValue(fakeBase64);

    const result = await screenshot();

    expect(mockSend).toHaveBeenCalledWith("screenshot");
    expect(result).toBe(fakeBase64);
  });

  it("propagates errors from connection", async () => {
    mockSend.mockRejectedValue(
      new Error("Godot is not connected. Start the editor and enable the MCP Bridge plugin."),
    );

    await expect(screenshot()).rejects.toThrow("Godot is not connected");
  });
});

describe("runProject", () => {
  it("calls send with 'run_project' action", async () => {
    mockSend.mockResolvedValue(null);

    await runProject();

    expect(mockSend).toHaveBeenCalledWith("run_project");
  });
});

describe("stopProject", () => {
  it("calls send with 'stop_project' action", async () => {
    mockSend.mockResolvedValue(null);

    await stopProject();

    expect(mockSend).toHaveBeenCalledWith("stop_project");
  });
});

describe("getDebugLog", () => {
  it("calls send with 'get_debug_log' action without params", async () => {
    mockSend.mockResolvedValue("some debug output\n");

    const result = await getDebugLog();

    expect(mockSend).toHaveBeenCalledWith("get_debug_log", undefined);
    expect(result).toBe("some debug output\n");
  });

  it("calls send with 'get_debug_log' action with lines param", async () => {
    mockSend.mockResolvedValue("line1\nline2\n");

    const result = await getDebugLog(2);

    expect(mockSend).toHaveBeenCalledWith("get_debug_log", { lines: 2 });
    expect(result).toBe("line1\nline2\n");
  });
});

describe("getSceneTreeLive", () => {
  it("calls send with 'get_scene_tree_live' action and returns object", async () => {
    const fakeTree = {
      name: "Root",
      type: "Node2D",
      children: [
        { name: "Player", type: "CharacterBody2D", children: [] },
      ],
    };
    mockSend.mockResolvedValue(fakeTree);

    const result = await getSceneTreeLive();

    expect(mockSend).toHaveBeenCalledWith("get_scene_tree_live");
    expect(result).toEqual(fakeTree);
  });
});
