import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { BottomNav } from "@/components/BottomNav";
import { SideNav } from "@/components/SideNav";
import { AppShell } from "@/components/AppShell";
import { Providers } from "./providers";
import { UserInitializer } from "@/components/UserInitializer";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// テーマカラーは manifest.json および globals.css と統一
const THEME_COLOR = "#4CAF50";

export const metadata: Metadata = {
  title: "アレルギースキャン",
  description: "アレルギーをスキャンして安心・安全な商品選びをサポート",
  manifest: "/manifest.json",
};

// <meta name="theme-color"> は Metadata ではなく Viewport でエクスポートする（Next.js 推奨方式）
export const viewport: Viewport = {
  themeColor: THEME_COLOR,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const messages = await getMessages();

  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider messages={messages}>
          <Providers>
            <UserInitializer />
            {/* PC/タブレット(lg+): 左サイドナビ。SP: 非表示 */}
            <SideNav />
            {/* コンテンツ領域: PC ではサイドバー分(w-56)右にシフト */}
            <AppShell>
              {children}
              {/* SP/タブレット: ボトムナビ。PC(lg+): 非表示 */}
              <BottomNav />
            </AppShell>
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
