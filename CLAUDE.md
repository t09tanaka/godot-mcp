# Godot MCP - Development Guide

## Project Overview

MCP (Model Context Protocol) plugin connecting Godot Engine with Claude Code.
Enables AI assistants to perform file operations and runtime control of Godot projects.

## Architecture

- **MCP Server**: TypeScript (Node.js), bundled to single JS with esbuild
- **Godot Editor Plugin** (`mcp_bridge.gd`): @tool GDScript, EditorPlugin with TCP server on port 6550
- **Game Bridge Autoload** (`mcp_game_bridge.gd`): GDScript autoload running inside the game process, TCP server on port 6551
- **Communication**: stdio (JSON-RPC) for MCP, TCP (JSON Lines) for editor bridge (6550) and game bridge (6551)

## Tech Stack

- TypeScript + Node.js for MCP server
- `@modelcontextprotocol/sdk` for MCP protocol
- `zod` for schema validation
- `esbuild` for bundling
- `vitest` for testing
- GDScript for Godot plugin (Godot 4.x)

## Repository Structure

```
godot-mcp/
├── addons/mcp_bridge/          # Godot plugin (distributed)
│   ├── plugin.cfg
│   ├── mcp_bridge.gd           # Editor plugin (port 6550)
│   ├── mcp_game_bridge.gd      # Game autoload (port 6551)
│   └── server/index.js         # Built output (gitignored)
├── src/                        # MCP server source
│   ├── index.ts                # MCP tool definitions
│   ├── godot-connection.ts     # TCP client for editor (port 6550)
│   ├── game-connection.ts      # TCP client for game (port 6551, with retry)
│   ├── runtime-tools.ts        # Runtime tool implementations
│   ├── file-tools.ts           # File operation implementations
│   └── ...
├── tests/                      # Test files
├── scripts/
│   └── build-release.sh
├── package.json
├── tsconfig.json
└── esbuild.config.mjs
```

## Build & Run

```bash
npm install          # Install dependencies
npm run build        # Build MCP server to addons/mcp_bridge/server/index.js
npm run dev          # Watch mode
npm test             # Run tests
npm run release      # Create release zip
```

## Code Conventions

- All commit messages, comments, and documentation in **English**
- Use `res://` path format when handling Godot file paths
- File operations work without Godot running; editor operations require editor plugin; game operations require running game
- Always validate Godot project root (look for `project.godot`)

## Tool Categories

### Scene & Project Operations (7 tools, no Godot required)
read_scene, create_scene, add_node, remove_node, update_scene_node,
attach_script, read_project_settings

### Editor Operations (3 tools, editor plugin required, port 6550)
run_project, stop_project, get_debug_log

### Game Operations (6 tools, running game required, port 6551)
game_window_screenshot, get_scene_tree_live, get_performance,
set_property_live, call_method, get_game_logs

## Testing Requirements

- All tool handler functions must have tests
- .tscn parser must be tested with edge cases
- TCP communication layer needs integration tests
- Use vitest for all tests

## Key Design Decisions

- TCP port 6550 for editor plugin, 6551 for game autoload
- Editor plugin auto-registers MCPGameBridge autoload on enable
- Game connection has retry logic for game startup delay
- Godot plugin is TCP server, MCP server is TCP client
- No project.godot write support (too risky)
- No signal connection editing (use GDScript `signal.connect()` instead)
- No animation/resource/input-map operations (editor GUI is more appropriate)
