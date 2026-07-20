"use client";

import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className = "",
}: {
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center gap-4 py-16 text-center ${className}`}>
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[var(--color-primary-soft)]">
        <Icon size={36} className="text-[var(--color-primary)]" />
      </div>
      <div>
        {title && (typeof title === "string" ? (
          <p className="text-lg font-semibold text-[var(--color-text)]">{title}</p>
        ) : (
          title
        ))}
        {description && (typeof description === "string" ? (
          <p className="mt-1 max-w-xs text-sm text-[var(--color-text-muted)]">{description}</p>
        ) : (
          description
        ))}
      </div>
      {action && <div className="mt-2 w-full max-w-xs">{action}</div>}
    </div>
  );
}
