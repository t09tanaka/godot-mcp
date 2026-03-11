#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

# Read version from package.json
VERSION=$(node -e "console.log(require('./package.json').version)")
echo "Building release v${VERSION}..."

# Step 1: Build the MCP server
echo "Running npm run build..."
npm run build

# Step 2: Create release directory
RELEASE_DIR="$PROJECT_ROOT/release"
STAGING_DIR="$RELEASE_DIR/staging/addons/mcp_bridge"
rm -rf "$RELEASE_DIR"
mkdir -p "$STAGING_DIR/server"

# Step 3: Copy files into proper structure
cp "$PROJECT_ROOT/addons/mcp_bridge/plugin.cfg" "$STAGING_DIR/"
cp "$PROJECT_ROOT/addons/mcp_bridge/mcp_bridge.gd" "$STAGING_DIR/"
cp "$PROJECT_ROOT/addons/mcp_bridge/server/index.js" "$STAGING_DIR/server/"

# Step 4: Create zip file
ZIP_NAME="godot-mcp-v${VERSION}.zip"
cd "$RELEASE_DIR/staging"
zip -r "$RELEASE_DIR/$ZIP_NAME" addons/

# Cleanup staging
rm -rf "$RELEASE_DIR/staging"

echo "Release created: release/${ZIP_NAME}"
