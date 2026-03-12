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

// Mock GameConnection before importing runtime-tools
vi.mock("../src/game-connection.js", () => {
  const mockGameSend = vi.fn();
  return {
    GameConnection: vi.fn().mockImplementation(() => ({
      send: mockGameSend,
    })),
    __mockGameSend: mockGameSend,
  };
});

// Import after mock setup
import {
  gameWindowScreenshot,
  runProject,
  stopProject,
  getDebugLog,
  getSceneTreeLive,
  getPerformance,
  setPropertyLive,
  callMethod,
  getGameLogs,
} from "../src/runtime-tools.js";

// Access the mock send functions
import * as connectionModule from "../src/godot-connection.js";
import * as gameConnectionModule from "../src/game-connection.js";
const mockSend = (connectionModule as any).__mockSend as ReturnType<typeof vi.fn>;
const mockGameSend = (gameConnectionModule as any).__mockGameSend as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockSend.mockReset();
  mockGameSend.mockReset();
});

// --- Editor operations (port 6550) ---

describe("runProject", () => {
  it("calls editor connection with 'run_project' action", async () => {
    mockSend.mockResolvedValue(null);

    await runProject();

    expect(mockSend).toHaveBeenCalledWith("run_project");
  });
});

describe("stopProject", () => {
  it("calls editor connection with 'stop_project' action", async () => {
    mockSend.mockResolvedValue(null);

    await stopProject();

    expect(mockSend).toHaveBeenCalledWith("stop_project");
  });
});

describe("getDebugLog", () => {
  it("calls editor connection with 'get_debug_log' action without params", async () => {
    mockSend.mockResolvedValue("some debug output\n");

    const result = await getDebugLog();

    expect(mockSend).toHaveBeenCalledWith("get_debug_log", undefined);
    expect(result).toBe("some debug output\n");
  });

  it("calls editor connection with 'get_debug_log' action with lines param", async () => {
    mockSend.mockResolvedValue("line1\nline2\n");

    const result = await getDebugLog(2);

    expect(mockSend).toHaveBeenCalledWith("get_debug_log", { lines: 2 });
    expect(result).toBe("line1\nline2\n");
  });
});

// --- Game operations (port 6551) ---

describe("gameWindowScreenshot", () => {
  it("calls game connection with 'screenshot' action and returns base64 string", async () => {
    const fakeBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB...";
    mockGameSend.mockResolvedValue(fakeBase64);

    const result = await gameWindowScreenshot();

    expect(mockGameSend).toHaveBeenCalledWith("screenshot");
    expect(result).toBe(fakeBase64);
  });

  it("propagates errors from game connection", async () => {
    mockGameSend.mockRejectedValue(
      new Error("Game is not running or MCP Game Bridge is not loaded."),
    );

    await expect(gameWindowScreenshot()).rejects.toThrow("Game is not running");
  });
});

describe("getSceneTreeLive", () => {
  it("calls game connection with 'get_scene_tree' action and returns object", async () => {
    const fakeTree = {
      name: "Root",
      type: "Node2D",
      children: [
        { name: "Player", type: "CharacterBody2D", children: [] },
      ],
    };
    mockGameSend.mockResolvedValue(fakeTree);

    const result = await getSceneTreeLive();

    expect(mockGameSend).toHaveBeenCalledWith("get_scene_tree");
    expect(result).toEqual(fakeTree);
  });
});

describe("getPerformance", () => {
  it("calls game connection with 'get_performance' action", async () => {
    const fakeMetrics = {
      fps: 60,
      frame_time: 0.016,
      memory_static: 1024000,
      draw_calls: 42,
    };
    mockGameSend.mockResolvedValue(fakeMetrics);

    const result = await getPerformance();

    expect(mockGameSend).toHaveBeenCalledWith("get_performance");
    expect(result).toEqual(fakeMetrics);
  });
});

describe("setPropertyLive", () => {
  it("calls game connection with 'set_property' action and correct params", async () => {
    const response = { node: "Player", property: "visible", value: false };
    mockGameSend.mockResolvedValue(response);

    const result = await setPropertyLive("Player", "visible", false);

    expect(mockGameSend).toHaveBeenCalledWith("set_property", {
      node_path: "Player",
      property: "visible",
      value: false,
    });
    expect(result).toEqual(response);
  });
});

describe("callMethod", () => {
  it("calls game connection with 'call_method' action and correct params", async () => {
    mockGameSend.mockResolvedValue(null);

    await callMethod("Player", "take_damage", [10]);

    expect(mockGameSend).toHaveBeenCalledWith("call_method", {
      node_path: "Player",
      method: "take_damage",
      args: [10],
    });
  });

  it("passes empty args array when no args provided", async () => {
    mockGameSend.mockResolvedValue("hello");

    const result = await callMethod("Player", "get_name");

    expect(mockGameSend).toHaveBeenCalledWith("call_method", {
      node_path: "Player",
      method: "get_name",
      args: [],
    });
    expect(result).toBe("hello");
  });
});

describe("getGameLogs", () => {
  it("calls game connection with 'get_game_logs' action without params", async () => {
    mockGameSend.mockResolvedValue("game output\n");

    const result = await getGameLogs();

    expect(mockGameSend).toHaveBeenCalledWith("get_game_logs", undefined);
    expect(result).toBe("game output\n");
  });

  it("calls game connection with 'get_game_logs' action with lines param", async () => {
    mockGameSend.mockResolvedValue("line1\n");

    const result = await getGameLogs(1);

    expect(mockGameSend).toHaveBeenCalledWith("get_game_logs", { lines: 1 });
    expect(result).toBe("line1\n");
  });
});
