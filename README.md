# Godot MCP

MCP (Model Context Protocol) server that connects **Godot Engine** with **Claude Code**.
Lets the AI assistant read and edit your Godot project files, run scenes, capture game window screenshots, inspect the live scene tree, and tune the game at runtime — all from the command line.

## Features

### Scene & Project Operations (no Godot required)

These tools work directly on the filesystem. The Godot editor does **not** need to be running.
File reading/writing is handled by Claude Code itself — these tools focus on Godot-specific formats.

| Tool | Description |
|------|-------------|
| `read_scene` | Parse a `.tscn` file and return the node tree as JSON |
| `create_scene` | Create a new `.tscn` scene file |
| `add_node` | Add a node to an existing scene |
| `remove_node` | Remove a node (and its children) from a scene |
| `update_scene_node` | Update properties of a node in a scene |
| `attach_script` | Attach a GDScript to a node in a scene |
| `read_project_settings` | Read values from `project.godot` |

### Editor Operations (Godot editor required)

These tools communicate with the Godot editor via TCP (port 6550). The editor must be running with the MCP Bridge plugin enabled.

| Tool | Description |
|------|-------------|
| `run_project` | Run the main scene |
| `stop_project` | Stop the running game |
| `get_debug_log` | Retrieve debug output (print statements, errors) |

### Game Operations (running game required)

These tools communicate directly with the running game process via TCP (port 6551). The game must be running (use `run_project` first). An autoload script (`MCPGameBridge`) is automatically registered when the MCP Bridge plugin is enabled.

| Tool | Description |
|------|-------------|
| `game_window_screenshot` | Capture a screenshot of the game window (not the editor) |
| `get_scene_tree_live` | Get the live scene tree from the running game |
| `get_performance` | Get performance metrics (FPS, memory, draw calls, etc.) |
| `set_property_live` | Set a property on a node at runtime (live tuning) |
| `call_method` | Call a method on a node in the running game |
| `get_game_logs` | Get captured log output from the game process |

## Installation

### 1. Download the plugin

Download `godot-mcp-v*.zip` from the [Releases](../../releases) page and extract it into your Godot project's `addons/` directory:

```bash
cd your-godot-project/addons
unzip godot-mcp-v*.zip
```

This creates the following structure:

```
your-godot-project/
└── addons/
    └── mcp_bridge/
        ├── plugin.cfg
        ├── mcp_bridge.gd
        ├── mcp_game_bridge.gd
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

### 3. Enable the Godot plugin (for editor & game tools)

To use editor tools (run/stop/debug log) and game tools (screenshot, live scene tree, performance, etc.):

1. Open your project in the Godot editor
2. Go to **Project → Project Settings → Plugins**
3. Enable **MCP Bridge**

The plugin does two things:
- Starts a TCP server on **port 6550** for editor operations
- Registers `MCPGameBridge` as an autoload, which starts a TCP server on **port 6551** inside the game process when the game is running

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
                                         ├─ Editor operations
                                         │  ↕ TCP (JSON Lines, port 6550)
                                         │  Godot Plugin (@tool GDScript)
                                         │  ↕ EditorInterface API
                                         │  Godot Editor
                                         │
                                         └─ Game operations
                                            ↕ TCP (JSON Lines, port 6551)
                                            MCPGameBridge (Autoload)
                                            ↕ SceneTree / Viewport / Performance
                                            Running Game Process
```

## Development

```bash
npm install          # Install dependencies
npm run build        # Build MCP server → addons/mcp_bridge/server/index.js
npm run dev          # Watch mode (rebuild on change)
npm test             # Run tests
npm run release      # Create release zip
```

## License

MIT
