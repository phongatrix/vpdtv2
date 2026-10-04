import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "VPĐT Forwarder — Trung chuyển văn bản tự động",
  description:
    "Hệ thống tự động chuyển văn bản từ cổng VPĐT Đồng Tháp sang Gmail và Google Drive, chạy 2 lần/ngày với thông báo Telegram.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
