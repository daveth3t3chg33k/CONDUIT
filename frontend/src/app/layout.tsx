import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { PlatformProvider } from "@/lib/PlatformContext";
import { ThemeProvider } from "@/lib/ThemeContext";
import { ToastProvider } from "@/lib/ToastContext";
import ToastContainer from "@/components/ToastContainer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Conduit — Split Payment Dashboard",
  description: "Payment routing and multi-vendor ledger management",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full`} suppressHydrationWarning>
      <body className="h-full bg-[var(--color-canvas)] text-[var(--color-ink)] antialiased">
        <ThemeProvider>
          <ToastProvider>
            <PlatformProvider>{children}</PlatformProvider>
            <ToastContainer />
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
