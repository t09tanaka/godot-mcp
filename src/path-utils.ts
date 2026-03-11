import { existsSync } from "node:fs";
import path from "node:path";

const RES_PREFIX = "res://";

/**
 * Find the Godot project root by searching upward for project.godot.
 * Returns the directory containing project.godot, or null if not found.
 */
export function findProjectRoot(startPath: string): string | null {
  let current = path.resolve(startPath);

  // Walk up the directory tree
  while (true) {
    const candidate = path.join(current, "project.godot");
    if (existsSync(candidate)) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      // Reached filesystem root
      return null;
    }
    current = parent;
  }
}

/**
 * Convert a res:// path to an absolute filesystem path.
 *
 * @example resToAbsolute("res://scenes/main.tscn", "/home/user/project")
 *          => "/home/user/project/scenes/main.tscn"
 */
export function resToAbsolute(resPath: string, projectRoot: string): string {
  if (!resPath.startsWith(RES_PREFIX)) {
    throw new Error(`Not a res:// path: ${resPath}`);
  }
  const relative = resPath.slice(RES_PREFIX.length);
  return path.join(projectRoot, relative);
}

/**
 * Convert an absolute filesystem path to a res:// path.
 *
 * @example absoluteToRes("/home/user/project/scenes/main.tscn", "/home/user/project")
 *          => "res://scenes/main.tscn"
 */
export function absoluteToRes(absPath: string, projectRoot: string): string {
  const resolved = path.resolve(absPath);
  const resolvedRoot = path.resolve(projectRoot);

  if (!resolved.startsWith(resolvedRoot + path.sep) && resolved !== resolvedRoot) {
    throw new Error(
      `Path is outside project root: ${absPath} (root: ${projectRoot})`,
    );
  }

  const relative = path.relative(resolvedRoot, resolved);
  // Use forward slashes for res:// paths (Godot convention)
  const normalized = relative.split(path.sep).join("/");
  return `${RES_PREFIX}${normalized}`;
}

/**
 * Normalize a path input that can be either a res:// path or a relative path.
 * Always returns an absolute filesystem path.
 */
export function normalizePath(inputPath: string, projectRoot: string): string {
  if (inputPath.startsWith(RES_PREFIX)) {
    return resToAbsolute(inputPath, projectRoot);
  }

  // Treat as relative to project root
  return path.resolve(projectRoot, inputPath);
}
