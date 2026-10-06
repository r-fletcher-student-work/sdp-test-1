import type { HistoryData } from './historyCache.js';

export interface TreeNode {
  name: string;
  /** repo-root-relative path; '' for the root node */
  path: string;
  type: 'dir' | 'file';
  children?: TreeNode[];
}

/**
 * File/directory tree of the repository's history: every path ever touched
 * (the brief's historical H.files), so deleted files stay browsable.
 * Directories sort before files, each alphabetically.
 */
export function buildTree(history: HistoryData, rootName: string): TreeNode {
  const root: TreeNode = { name: rootName, path: '', type: 'dir', children: [] };
  const dirNodes = new Map<string, TreeNode>([['', root]]);

  for (const filePath of history.files) {
    const parts = filePath.split('/');
    let prefix = '';
    let parent = root;
    for (let i = 0; i < parts.length - 1; i++) {
      prefix = prefix ? `${prefix}/${parts[i]}` : parts[i];
      let node = dirNodes.get(prefix);
      if (!node) {
        node = { name: parts[i], path: prefix, type: 'dir', children: [] };
        dirNodes.set(prefix, node);
        parent.children!.push(node);
      }
      parent = node;
    }
    parent.children!.push({ name: parts[parts.length - 1], path: filePath, type: 'file' });
  }

  sortTree(root);
  return root;
}

function sortTree(node: TreeNode): void {
  if (!node.children) return;
  node.children.sort((a, b) =>
    a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1,
  );
  for (const child of node.children) sortTree(child);
}
