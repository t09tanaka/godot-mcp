import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import path from "node:path";

import { normalizePath, absoluteToRes } from "./path-utils.js";
import {
  parseTscn,
  serializeTscn,
  buildNodeTree,
  addNodeToScene,
  removeNodeFromScene,
  updateNodeProperties,
  attachScriptToNode,
  type TscnScene,
  type NodeTreeEntry,
} from "./tscn-parser.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Simple glob-style pattern matching.
 * Supports:
 *  - `*` matches anything except `/`
 *  - `**` matches any number of path segments (including zero)
 *  - `?` matches a single character
 */
function matchGlob(pattern: string, filePath: string): boolean {
  // Normalise separators to forward slash
  const normPath = filePath.split(path.sep).join("/");

  // Convert glob pattern to regex
  let regexStr = "^";
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];

    if (ch === "*" && pattern[i + 1] === "*") {
      // ** matches zero or more path segments
      if (pattern[i + 2] === "/") {
        regexStr += "(?:.+/)?";
        i += 3;
      } else {
        regexStr += ".*";
        i += 2;
      }
    } else if (ch === "*") {
      regexStr += "[^/]*";
      i++;
    } else if (ch === "?") {
      regexStr += "[^/]";
      i++;
    } else if (ch === ".") {
      regexStr += "\\.";
      i++;
    } else {
      regexStr += ch;
      i++;
    }
  }
  regexStr += "$";

  return new RegExp(regexStr).test(normPath);
}

/**
 * Recursively read all files under a directory.
 * Returns relative paths using forward slashes.
 */
async function readDirRecursive(dir: string, base?: string): Promise<string[]> {
  const results: string[] = [];
  const baseDir = base ?? dir;

  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip hidden directories and .godot cache
      if (entry.name.startsWith(".")) continue;
      const children = await readDirRecursive(fullPath, baseDir);
      results.push(...children);
    } else {
      const relative = path.relative(baseDir, fullPath).split(path.sep).join("/");
      results.push(relative);
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

/**
 * List files in a project directory.
 * Returns an array of res:// paths.
 *
 * @param projectRoot - Absolute path to the Godot project root.
 * @param subPath     - Optional subdirectory to list (res:// or relative).
 * @param filter      - Optional glob pattern (e.g. "*.gd", "**\/*.tscn").
 */
export async function listFiles(
  projectRoot: string,
  subPath?: string,
  filter?: string,
): Promise<string[]> {
  const dirPath = subPath
    ? normalizePath(subPath, projectRoot)
    : projectRoot;

  const relativePaths = await readDirRecursive(dirPath);

  const filtered = filter
    ? relativePaths.filter((p) => matchGlob(filter, p))
    : relativePaths;

  // Convert to res:// paths
  return filtered.map((rel) => {
    const absPath = path.join(dirPath, rel);
    return absoluteToRes(absPath, projectRoot);
  });
}

/**
 * Read the contents of a GDScript (or any text) file.
 *
 * @param projectRoot - Absolute path to the Godot project root.
 * @param filePath    - File path (res:// or relative).
 */
export async function readScript(
  projectRoot: string,
  filePath: string,
): Promise<string> {
  const absPath = normalizePath(filePath, projectRoot);
  const content = await readFile(absPath, "utf-8");
  return content;
}

/**
 * Write content to a GDScript (or any text) file.
 * Creates parent directories if they don't exist.
 *
 * @param projectRoot - Absolute path to the Godot project root.
 * @param filePath    - File path (res:// or relative).
 * @param content     - File content to write.
 */
export async function writeScript(
  projectRoot: string,
  filePath: string,
  content: string,
): Promise<void> {
  const absPath = normalizePath(filePath, projectRoot);
  await mkdir(path.dirname(absPath), { recursive: true });
  await writeFile(absPath, content, "utf-8");
}

/**
 * Parse a .tscn scene file and return a JSON node tree.
 *
 * @param projectRoot - Absolute path to the Godot project root.
 * @param filePath    - Scene file path (res:// or relative).
 */
export async function readScene(
  projectRoot: string,
  filePath: string,
): Promise<NodeTreeEntry | null> {
  const absPath = normalizePath(filePath, projectRoot);
  const content = await readFile(absPath, "utf-8");
  const scene = parseTscn(content);
  return buildNodeTree(scene);
}

/**
 * Create a new .tscn scene file with a root node.
 *
 * @param projectRoot - Absolute path to the Godot project root.
 * @param filePath    - Scene file path (res:// or relative).
 * @param rootType    - Type of the root node (e.g. "Node2D", "Control").
 * @param rootName    - Optional name for the root node (defaults to filename without extension).
 */
export async function createScene(
  projectRoot: string,
  filePath: string,
  rootType: string,
  rootName?: string,
): Promise<void> {
  const absPath = normalizePath(filePath, projectRoot);

  const name =
    rootName ?? path.basename(absPath, path.extname(absPath));

  const scene: TscnScene = {
    format: 3,
    loadSteps: 1,
    extResources: [],
    subResources: [],
    nodes: [
      {
        name,
        type: rootType,
        properties: {},
      },
    ],
    connections: [],
  };

  const content = serializeTscn(scene);
  await mkdir(path.dirname(absPath), { recursive: true });
  await writeFile(absPath, content, "utf-8");
}

/**
 * Add a node to an existing scene file.
 *
 * @param projectRoot - Absolute path to the Godot project root.
 * @param scenePath   - Scene file path (res:// or relative).
 * @param parentPath  - Parent node path (e.g. "." for root, "Player/Sprite").
 * @param nodeName    - Name of the new node.
 * @param nodeType    - Type of the new node (e.g. "Sprite2D").
 * @param properties  - Optional properties for the new node.
 */
export async function addNode(
  projectRoot: string,
  scenePath: string,
  parentPath: string,
  nodeName: string,
  nodeType: string,
  properties?: Record<string, string>,
): Promise<void> {
  const absPath = normalizePath(scenePath, projectRoot);
  const content = await readFile(absPath, "utf-8");
  const scene = parseTscn(content);

  addNodeToScene(scene, parentPath, nodeName, nodeType, properties);

  const serialized = serializeTscn(scene);
  await writeFile(absPath, serialized, "utf-8");
}

/**
 * Remove a node (and its children) from a scene file.
 *
 * @param projectRoot - Absolute path to the Godot project root.
 * @param scenePath   - Scene file path (res:// or relative).
 * @param nodePath    - Path of the node to remove.
 */
export async function removeNode(
  projectRoot: string,
  scenePath: string,
  nodePath: string,
): Promise<void> {
  const absPath = normalizePath(scenePath, projectRoot);
  const content = await readFile(absPath, "utf-8");
  const scene = parseTscn(content);

  removeNodeFromScene(scene, nodePath);

  const serialized = serializeTscn(scene);
  await writeFile(absPath, serialized, "utf-8");
}

/**
 * Update properties on a node in a scene file.
 *
 * @param projectRoot - Absolute path to the Godot project root.
 * @param scenePath   - Scene file path (res:// or relative).
 * @param nodePath    - Path of the node to update.
 * @param properties  - Properties to set/merge.
 */
export async function updateSceneNode(
  projectRoot: string,
  scenePath: string,
  nodePath: string,
  properties: Record<string, string>,
): Promise<void> {
  const absPath = normalizePath(scenePath, projectRoot);
  const content = await readFile(absPath, "utf-8");
  const scene = parseTscn(content);

  updateNodeProperties(scene, nodePath, properties);

  const serialized = serializeTscn(scene);
  await writeFile(absPath, serialized, "utf-8");
}

/**
 * Attach a script to a node in a scene file.
 *
 * @param projectRoot - Absolute path to the Godot project root.
 * @param scenePath   - Scene file path (res:// or relative).
 * @param nodePath    - Path of the node to attach the script to.
 * @param scriptPath  - res:// path of the script file.
 */
export async function attachScript(
  projectRoot: string,
  scenePath: string,
  nodePath: string,
  scriptPath: string,
): Promise<void> {
  const absPath = normalizePath(scenePath, projectRoot);
  const content = await readFile(absPath, "utf-8");
  const scene = parseTscn(content);

  // Ensure scriptPath uses res:// format for the ext_resource
  const resScriptPath = scriptPath.startsWith("res://")
    ? scriptPath
    : absoluteToRes(normalizePath(scriptPath, projectRoot), projectRoot);

  attachScriptToNode(scene, nodePath, resScriptPath);

  const serialized = serializeTscn(scene);
  await writeFile(absPath, serialized, "utf-8");
}

// ---------------------------------------------------------------------------
// project.godot settings reader
// ---------------------------------------------------------------------------

/**
 * Parsed representation of project.godot settings.
 * Sections are stored as nested objects.
 */
export interface ProjectSettings {
  [section: string]: Record<string, string>;
}

/**
 * Parse an INI-like project.godot file into sections with key-value pairs.
 */
function parseProjectGodot(content: string): ProjectSettings {
  const settings: ProjectSettings = {};
  let currentSection = "";

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();

    // Skip empty lines and comments
    if (line === "" || line.startsWith(";")) continue;

    // Section header
    const sectionMatch = line.match(/^\[(.+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      if (!settings[currentSection]) {
        settings[currentSection] = {};
      }
      continue;
    }

    // Key=value pair (value may contain '=')
    const eqIndex = line.indexOf("=");
    if (eqIndex !== -1) {
      const key = line.slice(0, eqIndex).trim();
      const value = line.slice(eqIndex + 1).trim();
      if (!settings[currentSection]) {
        settings[currentSection] = {};
      }
      settings[currentSection][key] = value;
    }
  }

  return settings;
}

/**
 * Read project.godot settings.
 *
 * @param projectRoot - Absolute path to the Godot project root.
 * @param section     - Optional section to filter (e.g. "application").
 * @param key         - Optional key within section.
 * @returns Full settings object, a single section, or a single value wrapper.
 */
export async function readProjectSettings(
  projectRoot: string,
  section?: string,
  key?: string,
): Promise<ProjectSettings | Record<string, string> | { value: string }> {
  const filePath = path.join(projectRoot, "project.godot");
  const content = await readFile(filePath, "utf-8");
  const settings = parseProjectGodot(content);

  if (section !== undefined) {
    const sectionData = settings[section];
    if (!sectionData) {
      throw new Error(`Section not found: ${section}`);
    }

    if (key !== undefined) {
      const value = sectionData[key];
      if (value === undefined) {
        throw new Error(`Key not found: ${key} in section [${section}]`);
      }
      return { value };
    }

    return sectionData;
  }

  return settings;
}
