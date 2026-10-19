import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CS 武器箱跨平台差价分析",
  description:
    "Steam · 网易BUFF · IGXE 实时价格对比，CS2/CSGO 武器箱差价收益比率可视化分析",
  keywords: ["CS2", "CSGO", "武器箱", "Steam市场", "BUFF", "IGXE", "差价分析", "饰品价格"],
  icons: {
    icon: "https://new-front.chatglm.cn/activeimg/effective-web/69f17993283edbb6900dce9a",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
