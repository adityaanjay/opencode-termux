import { readFile, writeFile, readdir, stat, realpath } from 'fs/promises';
import { join, resolve, extname, basename } from 'path';
import { createHash } from 'crypto';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_LINES = 5000;

export async function readFileTool(path: string): Promise<string> {
  const resolvedPath = resolve(path);

  try {
    const stats = await stat(resolvedPath);
    if (stats.size > MAX_FILE_SIZE) {
      throw new Error(`File too large: ${stats.size} bytes (max ${MAX_FILE_SIZE})`);
    }

    const content = await readFile(resolvedPath, 'utf-8');
    const lines = content.split('\n');

    if (lines.length > MAX_LINES) {
      return lines.slice(0, MAX_LINES).join('\n') + `\n... [${lines.length - MAX_LINES} more lines truncated]`;
    }

    return content;
  } catch (error) {
    if (error instanceof Error && error.message.includes('ENOENT')) {
      throw new Error(`File not found: ${path}`);
    }
    throw error;
  }
}

export async function writeFileTool(path: string, content: string): Promise<string> {
  const resolvedPath = resolve(path);

  try {
    await writeFile(resolvedPath, content, 'utf-8');
    return `File written: ${path} (${content.length} chars)`;
  } catch (error) {
    throw new Error(`Failed to write file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function editFileTool(path: string, oldText: string, newText: string): Promise<string> {
  const resolvedPath = resolve(path);

  try {
    const content = await readFile(resolvedPath, 'utf-8');

    if (!content.includes(oldText)) {
      throw new Error('Old text not found in file');
    }

    const newContent = content.replace(oldText, newText);
    await writeFile(resolvedPath, newContent, 'utf-8');

    return `File edited: ${path}`;
  } catch (error) {
    if (error instanceof Error && error.message.includes('ENOENT')) {
      throw new Error(`File not found: ${path}`);
    }
    throw error;
  }
}

export async function listFilesTool(dir: string, recursive = false): Promise<string> {
  const resolvedDir = resolve(dir);

  async function walk(currentDir: string, prefix = ''): Promise<string[]> {
    const entries = await readdir(currentDir, { withFileTypes: true });
    const results: string[] = [];

    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.gitignore') continue;

      const fullPath = join(currentDir, entry.name);
      const relPath = prefix + entry.name;

      if (entry.isDirectory()) {
        results.push(`${relPath}/`);
        if (recursive) {
          results.push(...await walk(fullPath, relPath + '/'));
        }
      } else {
        const ext = extname(entry.name);
        const icon = getFileIcon(ext);
        results.push(`${icon} ${relPath}`);
      }
    }

    return results.sort();
  }

  try {
    const files = await walk(resolvedDir);
    return files.join('\n');
  } catch (error) {
    if (error instanceof Error && error.message.includes('ENOENT')) {
      throw new Error(`Directory not found: ${dir}`);
    }
    throw error;
  }
}

export async function grepTool(pattern: string, dir = '.', include?: string): Promise<string> {
  const resolvedDir = resolve(dir);
  const regex = new RegExp(pattern);
  const results: string[] = [];

  async function search(currentDir: string) {
    const entries = await readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.gitignore') continue;

      const fullPath = join(currentDir, entry.name);

      if (entry.isDirectory()) {
        await search(fullPath);
      } else if (!include || entry.name.match(new RegExp(include))) {
        try {
          const content = await readFile(fullPath, 'utf-8');
          const lines = content.split('\n');

          lines.forEach((line, i) => {
            if (regex.test(line)) {
              const relPath = fullPath.slice(resolvedDir.length + 1);
              results.push(`${relPath}:${i + 1}:${line.trim()}`);
            }
          });
        } catch {
          // Skip binary files
        }
      }
    }
  }

  await search(resolvedDir);
  return results.slice(0, 100).join('\n') + (results.length > 100 ? `\n... [${results.length - 100} more matches]` : '');
}

function getFileIcon(ext: string): string {
  const icons: Record<string, string> = {
    '.ts': '📄', '.tsx': '📄', '.js': '📄', '.jsx': '📄',
    '.json': '📋', '.md': '📝', '.txt': '📄',
    '.py': '🐍', '.rs': '🦀', '.go': '🐹', '.java': '☕',
    '.html': '🌐', '.css': '🎨', '.scss': '🎨',
    '.sql': '🗄', '.sh': '💻', '.yml': '⚙', '.yaml': '⚙',
    '.toml': '⚙', '.ini': '⚙', '.cfg': '⚙',
  };
  return icons[ext] || '📄';
}

// Export functions with expected names
export const readFile = readFileTool;
export const writeFile = writeFileTool;
export const editFile = editFileTool;
export const listFiles = listFilesTool;
export const grep = grepTool;