import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { findProjectRoot } from "./path-utils.js";
import {
  readScene,
  createScene,
  addNode,
  removeNode,
  updateSceneNode,
  attachScript,
  readProjectSettings,
} from "./file-tools.js";
import {
  screenshot,
  runProject,
  stopProject,
  getDebugLog,
  getSceneTreeLive,
} from "./runtime-tools.js";

// ---------------------------------------------------------------------------
// Project root resolution
// ---------------------------------------------------------------------------

function resolveProjectRoot(): string {
  const args = process.argv;
  const projectIdx = args.indexOf("--project");
  const startPath = projectIdx !== -1 ? args[projectIdx + 1] : process.cwd();
  const root = findProjectRoot(startPath);
  if (!root) {
    console.error("Could not find project.godot");
    process.exit(1);
  }
  return root;
}

const PROJECT_ROOT = resolveProjectRoot();

// ---------------------------------------------------------------------------
// Helper: wrap tool handlers with error handling
// ---------------------------------------------------------------------------

type ToolResult = {
  content: Array<
    | { type: "text"; text: string }
    | { type: "image"; data: string; mimeType: string }
  >;
  isError?: boolean;
};

function textResult(data: unknown): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

function errorResult(err: unknown): ToolResult {
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

// ---------------------------------------------------------------------------
// MCP Server setup
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "godot-mcp",
  version: "0.1.0",
});

// --- File operation tools (7) ---

server.tool(
  "read_scene",
  "Read a scene file (.tscn) and return as JSON tree",
  {
    path: z.string().describe("Scene file path (res:// or relative)"),
  },
  async ({ path }) => {
    try {
      const tree = await readScene(PROJECT_ROOT, path);
      return textResult(tree);
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.tool(
  "create_scene",
  "Create a new scene file with a root node",
  {
    path: z.string().describe("Scene file path (res:// or relative)"),
    root_type: z.string().describe("Root node type (e.g. 'Node2D', 'Control')"),
    root_name: z.string().optional().describe("Root node name (defaults to filename)"),
  },
  async ({ path, root_type, root_name }) => {
    try {
      await createScene(PROJECT_ROOT, path, root_type, root_name);
      return textResult({ success: true, path });
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.tool(
  "add_node",
  "Add a node to an existing scene",
  {
    scene_path: z.string().describe("Scene file path (res:// or relative)"),
    parent_path: z.string().describe("Parent node path (e.g. '.' for root)"),
    node_name: z.string().describe("Name for the new node"),
    node_type: z.string().describe("Node type (e.g. 'Sprite2D', 'CollisionShape2D')"),
    properties: z.record(z.string()).optional().describe("Node properties to set"),
  },
  async ({ scene_path, parent_path, node_name, node_type, properties }) => {
    try {
      await addNode(
        PROJECT_ROOT,
        scene_path,
        parent_path,
        node_name,
        node_type,
        properties,
      );
      return textResult({ success: true, scene_path, node_name });
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.tool(
  "remove_node",
  "Remove a node from a scene",
  {
    scene_path: z.string().describe("Scene file path (res:// or relative)"),
    node_path: z.string().describe("Path of the node to remove"),
  },
  async ({ scene_path, node_path }) => {
    try {
      await removeNode(PROJECT_ROOT, scene_path, node_path);
      return textResult({ success: true, scene_path, node_path });
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.tool(
  "update_scene_node",
  "Update properties of a node in a scene",
  {
    scene_path: z.string().describe("Scene file path (res:// or relative)"),
    node_path: z.string().describe("Path of the node to update"),
    properties: z.record(z.string()).describe("Properties to set/merge"),
  },
  async ({ scene_path, node_path, properties }) => {
    try {
      await updateSceneNode(PROJECT_ROOT, scene_path, node_path, properties);
      return textResult({ success: true, scene_path, node_path });
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.tool(
  "attach_script",
  "Attach a script to a node in a scene",
  {
    scene_path: z.string().describe("Scene file path (res:// or relative)"),
    node_path: z.string().describe("Path of the node to attach the script to"),
    script_path: z.string().describe("Script file path (res:// or relative)"),
  },
  async ({ scene_path, node_path, script_path }) => {
    try {
      await attachScript(PROJECT_ROOT, scene_path, node_path, script_path);
      return textResult({ success: true, scene_path, node_path, script_path });
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.tool(
  "read_project_settings",
  "Read project.godot settings",
  {
    section: z.string().optional().describe("Section to filter (e.g. 'application')"),
    key: z.string().optional().describe("Key within section"),
  },
  async ({ section, key }) => {
    try {
      const settings = await readProjectSettings(PROJECT_ROOT, section, key);
      return textResult(settings);
    } catch (err) {
      return errorResult(err);
    }
  },
);

// --- Runtime tools (5) ---

server.tool(
  "screenshot",
  "Capture a screenshot of the Godot editor viewport",
  {},
  async () => {
    try {
      const base64 = await screenshot();
      return {
        content: [
          { type: "image" as const, data: base64, mimeType: "image/png" },
        ],
      };
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.tool(
  "run_project",
  "Run the main scene in the Godot editor",
  {},
  async () => {
    try {
      await runProject();
      return textResult({ success: true });
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.tool(
  "stop_project",
  "Stop the running game in the Godot editor",
  {},
  async () => {
    try {
      await stopProject();
      return textResult({ success: true });
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.tool(
  "get_debug_log",
  "Get debug output from the Godot editor",
  {
    lines: z.number().optional().describe("Number of recent log lines to retrieve"),
  },
  async ({ lines }) => {
    try {
      const log = await getDebugLog(lines);
      return textResult(log);
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.tool(
  "get_scene_tree_live",
  "Get the live scene tree from the running game",
  {},
  async () => {
    try {
      const tree = await getSceneTreeLive();
      return textResult(tree);
    } catch (err) {
      return errorResult(err);
    }
  },
);

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`godot-mcp server started (project: ${PROJECT_ROOT})`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
