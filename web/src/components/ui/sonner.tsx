"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"

/**
 * 全局 toast 容器。挂载一次即可，用 toast.success/toast.error 触发。
 * 样式随 shadcn 主题（slate + cssVariables）。
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      position="top-right"
      style={{ top: "60px" }}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border group-[.toaster]:shadow-lg",
          success: "group-[.toaster]:border-emerald-500/60 [&_[data-icon]]:text-emerald-600",
          error: "group-[.toaster]:border-destructive [&_[data-icon]]:text-destructive",
          warning: "group-[.toaster]:border-amber-500/60 [&_[data-icon]]:text-amber-600",
          info: "group-[.toaster]:border-blue-500/60 [&_[data-icon]]:text-blue-600",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
