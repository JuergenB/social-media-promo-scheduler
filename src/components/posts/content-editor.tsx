"use client";

import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { CharCounter } from "./char-counter";
import { cn } from "@/lib/utils";
import { Pencil } from "lucide-react";

// ── Linkified text helper ──────────────────────────────────────────────

function LinkifiedText({ text }: { text: string }) {
  const urlRegex = /(https?:\/\/[^\s)]+)/g;
  const parts = text.split(urlRegex);

  return (
    <>
      {parts.map((part, i) =>
        urlRegex.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-primary hover:underline break-all"
          >
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

// ── Content editor ─────────────────────────────────────────────────────

interface ContentEditorProps {
  content: string;
  platform?: string;
  charLimit?: number;
  /** Read-only mode — no editing allowed */
  readOnly?: boolean;
  /** Always show the textarea (compose mode) vs click-to-edit (campaign mode) */
  alwaysEditing?: boolean;
  // Click-to-edit mode props
  isEditing?: boolean;
  editedContent?: string;
  onEditedContentChange?: (content: string) => void;
  onStartEditing?: () => void;
  onCancelEditing?: () => void;
  onSave?: () => void;
  isSaving?: boolean;
  /** Whether save button should be disabled */
  saveDisabled?: boolean;
  className?: string;
}

export function ContentEditor({
  content,
  platform,
  charLimit,
  readOnly = false,
  alwaysEditing = false,
  isEditing = false,
  editedContent = "",
  onEditedContentChange,
  onStartEditing,
  onCancelEditing,
  onSave,
  isSaving = false,
  saveDisabled = false,
  className,
}: ContentEditorProps) {
  const charCount = (isEditing || alwaysEditing ? editedContent : content)?.length || 0;

  // Always-editing mode (compose page)
  if (alwaysEditing) {
    return (
      <div className={cn("space-y-2", className)}>
        <Textarea
          value={editedContent}
          onChange={(e) => onEditedContentChange?.(e.target.value)}
          rows={8}
          placeholder="What's on your mind?"
          className="resize-none text-sm"
        />
        <div className="flex justify-end">
          <CharCounter count={charCount} platform={platform} limit={charLimit} />
        </div>
      </div>
    );
  }

  // Click-to-edit mode
  if (isEditing) {
    return (
      <div className={cn("space-y-2", className)}>
        <Textarea
          value={editedContent}
          onChange={(e) => onEditedContentChange?.(e.target.value)}
          rows={8}
          className="text-sm"
          autoFocus
        />
        <div className="flex items-center justify-between">
          <CharCounter count={charCount} platform={platform} limit={charLimit} />
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" className="text-xs" onClick={onCancelEditing}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="text-xs"
              onClick={onSave}
              disabled={isSaving || saveDisabled}
            >
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Read mode — clickable to edit (unless readOnly)
  return (
    <div
      className={cn(
        "group relative rounded-md p-1 -m-1",
        !readOnly && "cursor-pointer hover:bg-muted/30 transition-colors",
        className,
      )}
      onClick={() => {
        if (!readOnly) onStartEditing?.();
      }}
    >
      <p className="text-sm whitespace-pre-wrap">
        {content ? <LinkifiedText text={content} /> : "(No content)"}
      </p>
      <div className="flex items-center justify-between mt-2">
        <CharCounter count={content?.length || 0} platform={platform} limit={charLimit} />
        {!readOnly && (
          <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
            <Pencil className="h-3 w-3" />
            Click to edit
          </span>
        )}
      </div>
    </div>
  );
}
