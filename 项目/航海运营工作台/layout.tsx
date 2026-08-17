import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "航海运营工作台",
  description: "航海运营团队每日使用的数据驾驶舱。",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
