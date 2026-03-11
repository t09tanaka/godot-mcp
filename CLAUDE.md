# Godot MCP - Development Guide

## Project Overview

MCP (Model Context Protocol) plugin connecting Godot Engine with Claude Code.
Enables AI assistants to perform file operations and runtime control of Godot projects.

## Architecture

- **MCP Server**: TypeScript (Node.js), bundled to single JS with esbuild
- **Godot Plugin**: @tool GDScript, EditorPlugin with TCP server on port 6550
- **Communication**: stdio (JSON-RPC) for MCP, TCP (JSON Lines) for Godot bridge

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
│   ├── mcp_bridge.gd
│   └── server/index.js         # Built output (gitignored)
├── src/                        # MCP server source
│   └── index.ts
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
- File operations work without Godot running; runtime operations require Godot plugin
- Always validate Godot project root (look for `project.godot`)

## Tool Categories

### File Operations (10 tools, no Godot required)
list_files, read_script, write_script, read_scene, create_scene,
add_node, remove_node, update_scene_node, attach_script, read_project_settings

### Runtime Operations (5 tools, Godot plugin required)
screenshot, run_project, stop_project, get_debug_log, get_scene_tree_live

## Testing Requirements

- All tool handler functions must have tests
- .tscn parser must be tested with edge cases
- TCP communication layer needs integration tests
- Use vitest for all tests

## Key Design Decisions

- TCP port 6550 is fixed (single project at a time)
- Godot plugin is TCP server, MCP server is TCP client
- No project.godot write support (too risky)
- No signal connection editing (use GDScript `signal.connect()` instead)
- No animation/resource/input-map operations (editor GUI is more appropriate)
