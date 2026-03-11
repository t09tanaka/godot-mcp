# Godot MCP

MCP (Model Context Protocol) server that connects **Godot Engine** with **Claude Code**.
Lets the AI assistant read and edit your Godot project files, run scenes, capture screenshots, and inspect the live scene tree — all from the command line.

## Features

### File Operations (no Godot required)

These tools work directly on the filesystem. The Godot editor does **not** need to be running.

| Tool | Description |
|------|-------------|
| `list_files` | List project files with optional glob filter (`*.gd`, `*.tscn`, …) |
| `read_script` | Read a GDScript file |
| `write_script` | Write / create a GDScript file |
| `read_scene` | Parse a `.tscn` file and return the node tree as JSON |
| `create_scene` | Create a new `.tscn` scene file |
| `add_node` | Add a node to an existing scene |
| `remove_node` | Remove a node (and its children) from a scene |
| `update_scene_node` | Update properties of a node in a scene |
| `attach_script` | Attach a GDScript to a node in a scene |
| `read_project_settings` | Read values from `project.godot` |

### Runtime Operations (Godot editor required)

These tools communicate with the Godot editor via TCP (port 6550). The editor must be running with the MCP Bridge plugin enabled.

| Tool | Description |
|------|-------------|
| `screenshot` | Capture a viewport screenshot (returned as PNG) |
| `run_project` | Run the main scene |
| `stop_project` | Stop the running game |
| `get_debug_log` | Retrieve debug output (print statements, errors) |
| `get_scene_tree_live` | Get the live scene tree of the running game |

## Installation

### 1. Download the plugin

Download `godot-mcp-v*.zip` from the [Releases](../../releases) page and extract it into your Godot project's `addons/` directory:

```
your-godot-project/
└── addons/
    └── mcp_bridge/
        ├── plugin.cfg
        ├── mcp_bridge.gd
        └── server/
            └── index.js
```

### 2. Configure Claude Code

Add the following to `.mcp.json` in your Godot project root:

```json
{
  "mcpServers": {
    "godot": {
      "command": "node",
      "args": ["addons/mcp_bridge/server/index.js", "--project", "."]
    }
  }
}
```

That's it — Claude Code will automatically start the MCP server when you open the project.

### 3. Enable the Godot plugin (optional, for runtime tools)

If you want to use runtime tools (screenshot, run/stop, debug log, live scene tree):

1. Open your project in the Godot editor
2. Go to **Project → Project Settings → Plugins**
3. Enable **MCP Bridge**

The plugin starts a TCP server on port 6550 that the MCP server connects to when runtime tools are called.

## Requirements

- **Node.js** 18+
- **Godot** 4.x (for the editor plugin; file operations work without Godot)
- **Claude Code** (or any MCP-compatible client)

## Architecture

```
Claude Code ←── stdio (JSON-RPC) ──→ MCP Server (Node.js)
                                         │
                                         ├─ File operations
                                         │  (direct filesystem access)
                                         │
                                         └─ Runtime operations
                                            ↕ TCP (JSON Lines, port 6550)
                                         Godot Plugin (@tool GDScript)
                                            ↕ EditorInterface API
                                         Godot Editor
```

## Development

```bash
npm install          # Install dependencies
npm run build        # Build MCP server → addons/mcp_bridge/server/index.js
npm run dev          # Watch mode (rebuild on change)
npm test             # Run tests (97 tests)
npm run release      # Create release zip
```

## License

MIT
