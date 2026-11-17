import React, { useState, useEffect } from 'react';
import { Text, Box, useInput, useStdout } from 'ink';
import { readdirSync, statSync } from 'fs';
import { join, basename, extname } from 'path';

interface FileTreeProps {
  root: string;
  onSelect?: (path: string) => void;
  onOpen?: (path: string) => void;
  filter?: string;
  showHidden?: boolean;
  gitStatus?: Record<string, 'added' | 'modified' | 'deleted'>;
}

interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileNode[];
  expanded?: boolean;
  selected?: boolean;
}

function buildTree(dir: string, filter = '', showHidden = false): FileNode[] {
  try {
    const entries = readdirSync(dir);
    return entries
      .filter(name => {
        if (!showHidden && name.startsWith('.')) return false;
        if (filter && !name.toLowerCase().includes(filter.toLowerCase())) return false;
        return true;
      })
      .map(name => {
        const fullPath = join(dir, name);
        const stat = statSync(fullPath);
        return {
          name,
          path: fullPath,
          isDirectory: stat.isDirectory(),
        };
      })
      .sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  } catch {
    return [];
  }
}

const fileIcons: Record<string, string> = {
  '.ts': '📄', '.tsx': '📄', '.js': '📄', '.jsx': '📄',
  '.json': '📋', '.md': '📝', '.txt': '📄',
  '.py': '🐍', '.rs': '🦀', '.go': '🐹', '.java': '☕',
  '.html': '🌐', '.css': '🎨', '.scss': '🎨',
  '.sql': '🗄', '.sh': '💻', '.yml': '⚙', '.yaml': '⚙',
  '.toml': '⚙', '.ini': '⚙', '.cfg': '⚙',
};

export const FileTree: React.FC<FileTreeProps> = ({
  root,
  onSelect,
  onOpen,
  filter = '',
  showHidden = false,
  gitStatus = {},
}) => {
  const [nodes, setNodes] = useState<FileNode[]>(() => buildTree(root, filter, showHidden));
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set([root]));

  useEffect(() => {
    setNodes(buildTree(root, filter, showHidden));
    setSelectedIndex(0);
  }, [root, filter, showHidden]);

  const flattenNodes = (nodes: FileNode[], prefix = ''): FileNode[] => {
    return nodes.flatMap(node => {
      const result = [{ ...node, path: prefix + node.name }];
      if (node.isDirectory && node.expanded && node.children) {
        result.push(...flattenNodes(node.children, prefix + node.name + '/'));
      }
      return result;
    });
  };

  const flatNodes = flattenNodes(nodes);

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex(i => Math.max(0, i - 1));
    }
    if (key.downArrow) {
      setSelectedIndex(i => Math.min(flatNodes.length - 1, i + 1));
    }
    if (key.return) {
      const node = flatNodes[selectedIndex];
      if (node) {
        if (node.isDirectory) {
          setExpandedPaths(prev => {
            const next = new Set(prev);
            if (next.has(node.path)) next.delete(node.path);
            else next.add(node.path);
            return next;
          });
        } else {
          onOpen?.(node.path);
        }
      }
    }
    if (key.space) {
      const node = flatNodes[selectedIndex];
      if (node) onSelect?.(node.path);
    }
  });

  const renderNode = (node: FileNode, depth: number) => {
    const isSelected = flatNodes[selectedIndex]?.path === node.path;
    const icon = node.isDirectory
      ? (expandedPaths.has(node.path) ? '▼' : '▶')
      : (fileIcons[extname(node.name)] || '📄');

    const gitColor = gitStatus[node.path]
      ? gitStatus[node.path] === 'added' ? 'green' : gitStatus[node.path] === 'modified' ? 'yellow' : 'red'
      : 'inherit';

    return (
      <Box key={node.path} flexDirection="row" alignItems="center" paddingLeft={depth * 2}>
        <Text color={isSelected ? 'white' : 'gray'} backgroundColor={isSelected ? 'blue' : 'transparent'}>
          {icon} {node.name}
        </Text>
      </Box>
    );
  };

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} paddingY={1}>
      <Text color="cyan" bold marginBottom={1}>📁 {basename(root)}</Text>
      {filter && <Text color="gray" dimColor marginBottom={1}>Filter: {filter}</Text>}
      <Box flexDirection="column" height={20}>
        {flatNodes.length === 0 ? (
          <Text color="gray" dimColor>No files found</Text>
        ) : (
          flatNodes.slice(0, 20).map((node, i) => {
            // Calculate depth from path
            const depth = (node.path.match(/\//g) || []).length;
            return renderNode(node, depth);
          })
        )}
      </Box>
    </Box>
  );
};