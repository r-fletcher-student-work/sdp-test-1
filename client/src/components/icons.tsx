interface IconProps {
  className?: string;
}

export function FolderIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    // Explicit width/height keep the icon at a sane intrinsic size even when a
    // caller passes a className without size utilities (CSS classes still win).
    <svg className={className} width={16} height={16} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M2 5a2 2 0 0 1 2-2h3.6a2 2 0 0 1 1.4.6L10.4 5H16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5Z" />
    </svg>
  );
}

export function FileIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg className={className} width={16} height={16} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M5 2a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7.4L11.6 2H5Zm6.5 1.6L16 8h-3.5a1 1 0 0 1-1-1V3.6Z" />
    </svg>
  );
}

export function ChevronIcon({ className = 'h-3.5 w-3.5' }: IconProps) {
  return (
    <svg className={className} width={14} height={14} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M7.3 4.3a1 1 0 0 1 1.4 0l5 5a1 1 0 0 1 0 1.4l-5 5a1 1 0 1 1-1.4-1.4L11.6 10 7.3 5.7a1 1 0 0 1 0-1.4Z"
        clipRule="evenodd"
      />
    </svg>
  );
}
