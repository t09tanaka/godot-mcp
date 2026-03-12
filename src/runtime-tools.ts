import { GodotConnection } from "./godot-connection.js";
import { GameConnection } from "./game-connection.js";

/** Connection to the editor plugin (port 6550). */
const editorConnection = new GodotConnection();

/** Connection to the game process autoload (port 6551). */
const gameConnection = new GameConnection();

// ---------------------------------------------------------------------------
// Editor operations (require editor plugin on port 6550)
// ---------------------------------------------------------------------------

/**
 * Run the main scene in the Godot editor.
 */
export async function runProject(): Promise<void> {
  await editorConnection.send("run_project");
}

/**
 * Stop the currently running game in the Godot editor.
 */
export async function stopProject(): Promise<void> {
  await editorConnection.send("stop_project");
}

/**
 * Get debug output from the Godot editor.
 * @param lines - Number of recent log lines to retrieve (default: all)
 * @returns Debug log text
 */
export async function getDebugLog(lines?: number): Promise<string> {
  const params = lines !== undefined ? { lines } : undefined;
  const data = await editorConnection.send("get_debug_log", params);
  return data as string;
}

// ---------------------------------------------------------------------------
// Game operations (require running game with autoload on port 6551)
// ---------------------------------------------------------------------------

/**
 * Capture a screenshot of the running game window.
 * @returns base64-encoded PNG string
 */
export async function gameWindowScreenshot(): Promise<string> {
  const data = await gameConnection.send("screenshot");
  return data as string;
}

/**
 * Get the live scene tree from the running game.
 * @returns Scene tree structure as an object
 */
export async function getSceneTreeLive(): Promise<object> {
  const data = await gameConnection.send("get_scene_tree");
  return data as object;
}

/**
 * Get performance metrics from the running game.
 * @returns Object with FPS, memory, draw calls, etc.
 */
export async function getPerformance(): Promise<object> {
  const data = await gameConnection.send("get_performance");
  return data as object;
}

/**
 * Set a property on a node in the running game.
 * @param nodePath - Node path (e.g. "Player", "UI/HealthBar")
 * @param property - Property name (e.g. "position", "visible")
 * @param value - Value to set
 * @returns Confirmation with the actual value after setting
 */
export async function setPropertyLive(
  nodePath: string,
  property: string,
  value: unknown,
): Promise<object> {
  const data = await gameConnection.send("set_property", {
    node_path: nodePath,
    property,
    value,
  });
  return data as object;
}

/**
 * Call a method on a node in the running game.
 * @param nodePath - Node path (e.g. "Player", "UI/HealthBar")
 * @param method - Method name
 * @param args - Arguments to pass to the method
 * @returns Return value of the method call
 */
export async function callMethod(
  nodePath: string,
  method: string,
  args?: unknown[],
): Promise<unknown> {
  const data = await gameConnection.send("call_method", {
    node_path: nodePath,
    method,
    args: args ?? [],
  });
  return data;
}

/**
 * Get captured log output from the running game.
 * @param lines - Number of recent log lines to retrieve (default: all)
 * @returns Game log text
 */
export async function getGameLogs(lines?: number): Promise<string> {
  const params = lines !== undefined ? { lines } : undefined;
  const data = await gameConnection.send("get_game_logs", params);
  return data as string;
}
