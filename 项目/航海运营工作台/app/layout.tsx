import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "抖音 CPS 五期航海情报",
  description: "从航海群聊中提炼的每日重要信息、已确认答案与实操反馈。",
  other: { "codex-preview": "development" },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
