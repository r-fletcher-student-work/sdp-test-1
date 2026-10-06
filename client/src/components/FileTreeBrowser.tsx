import { useState } from 'react';
import type { TreeNode } from '../api/types';
import { ChevronIcon, FileIcon, FolderIcon } from './icons';

interface FileTreeBrowserProps {
  /** root node of the repository tree */
  node: TreeNode;
  /** currently selected path; '' = repository overview */
  selectedPath: string;
  onSelect(path: string): void;
}

/**
 * Collapsible file/directory browser. Clicking a row selects the path
 * (directory or file); the chevron expands/collapses a directory.
 */
export function FileTreeBrowser({ node, selectedPath, onSelect }: FileTreeBrowserProps) {
  return (
    <nav
      aria-label="Repository files"
      className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white shadow-sm"
    >
      <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Files
      </div>
      <div className="max-h-[60vh] overflow-y-auto p-1 lg:max-h-[calc(100vh-14rem)]">
        <TreeRow node={node} depth={0} selectedPath={selectedPath} onSelect={onSelect} />
      </div>
    </nav>
  );
}

interface TreeRowProps {
  node: TreeNode;
  depth: number;
  selectedPath: string;
  onSelect(path: string): void;
}

function TreeRow({ node, depth, selectedPath, onSelect }: TreeRowProps) {
  const isDir = node.type === 'dir';
  // The root and its immediate directories start expanded.
  const [expanded, setExpanded] = useState(depth <= 1);
  const selected = selectedPath === node.path;

  return (
    <div>
      <div
        role="treeitem"
        aria-expanded={isDir ? expanded : undefined}
        aria-selected={selected}
        tabIndex={0}
        onClick={() => onSelect(node.path)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onSelect(node.path);
          }
        }}
        className={`flex cursor-pointer items-center gap-1.5 rounded px-2 py-1 text-sm ${
          selected ? 'bg-blue-50 font-medium text-blue-700' : 'text-slate-700 hover:bg-slate-50'
        }`}
        style={{ paddingLeft: depth * 14 + 8 }}
      >
        {isDir ? (
          <button
            type="button"
            aria-label={expanded ? `Collapse ${node.name}` : `Expand ${node.name}`}
            className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
            onClick={(event) => {
              event.stopPropagation();
              setExpanded((value) => !value);
            }}
          >
            <ChevronIcon className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-90' : ''}`} />
          </button>
        ) : (
          <span className="w-[22px] shrink-0" />
        )}
        {isDir ? (
          <FolderIcon className="shrink-0 text-blue-400" />
        ) : (
          <FileIcon className="shrink-0 text-slate-400" />
        )}
        <span className="truncate">{node.name}</span>
      </div>
      {isDir &&
        expanded &&
        node.children?.map((child) => (
          <TreeRow
            key={child.path}
            node={child}
            depth={depth + 1}
            selectedPath={selectedPath}
            onSelect={onSelect}
          />
        ))}
    </div>
  );
}
