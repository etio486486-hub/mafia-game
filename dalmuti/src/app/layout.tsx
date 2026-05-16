import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "달무티 — The Great Dalmuti",
  description: "4인 핫시트 달무티 보드게임",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="min-h-screen antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
