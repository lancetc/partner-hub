"use client";

import { Icon } from "./Icon";

export function HeaderIconButton({
  label,
  icon,
  onClick,
  ...rest
}: { label: string; icon: React.ComponentProps<typeof Icon>["name"] } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="inline-flex size-11 items-center justify-center rounded-full text-ink hover:bg-muted"
      {...rest}
    >
      <Icon name={icon} className="size-5" />
    </button>
  );
}
