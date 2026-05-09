import type { ButtonHTMLAttributes, HTMLAttributes, PropsWithChildren } from "react";

export function Button({
  className = "",
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  return <button className={`ui-button ui-button-${variant} ${className}`.trim()} {...props} />;
}

export function Badge({
  className = "",
  tone = "neutral",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "success" | "warning" | "danger" | "info" }) {
  return <span className={`ui-badge ui-badge-${tone} ${className}`.trim()} {...props} />;
}

export function Panel({ className = "", children, ...props }: PropsWithChildren<HTMLAttributes<HTMLElement>>) {
  return (
    <section className={`ui-panel ${className}`.trim()} {...props}>
      {children}
    </section>
  );
}
