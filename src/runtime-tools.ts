import { GodotConnection } from "./godot-connection.js";

const connection = new GodotConnection();

/**
 * Capture viewport screenshot from the running Godot editor.
 * @returns base64-encoded PNG string
 */
export async function screenshot(): Promise<string> {
  const data = await connection.send("screenshot");
  return data as string;
}

/**
 * Run the main scene in the Godot editor.
 */
export async function runProject(): Promise<void> {
  await connection.send("run_project");
}

/**
 * Stop the currently running game in the Godot editor.
 */
export async function stopProject(): Promise<void> {
  await connection.send("stop_project");
}

/**
 * Get debug output from the Godot editor.
 * @param lines - Number of recent log lines to retrieve (default: all)
 * @returns Debug log text
 */
export async function getDebugLog(lines?: number): Promise<string> {
  const params = lines !== undefined ? { lines } : undefined;
  const data = await connection.send("get_debug_log", params);
  return data as string;
}

/**
 * Get the live scene tree from the running game.
 * @returns Scene tree structure as an object
 */
export async function getSceneTreeLive(): Promise<object> {
  const data = await connection.send("get_scene_tree_live");
  return data as object;
}
