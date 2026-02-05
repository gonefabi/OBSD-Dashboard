// Shared lucide icon renderer for widgets.
import * as React from "react";
import { setIcon } from "obsidian";

export const LucideIcon: React.FC<{ name?: string; className?: string }> = ({
  name,
  className,
}) => {
  const iconRef = React.useRef<HTMLSpanElement | null>(null);
  const iconName = name?.trim();

  React.useEffect(() => {
    if (!iconRef.current) return;
    iconRef.current.innerHTML = "";
    if (iconName) {
      setIcon(iconRef.current, iconName);
    }
  }, [iconName]);

  if (!iconName) return null;
  return <span ref={iconRef} className={className} aria-hidden="true" />;
};
