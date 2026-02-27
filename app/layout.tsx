import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import LogoutButton from "@/components/auth/LogoutButton";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Compliance Matters",
    template: "%s | Compliance Matters",
  },
  description: "Compliance Matters ECC & Operations Software",
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-50`}
      >
        <div className="min-h-screen flex flex-col">

          {/* Top Bar */}
          <header className="flex items-center justify-between px-6 py-3 border-b bg-white">
            <div className="text-sm font-semibold">
              Compliance Matters
            </div>
            <LogoutButton />
          </header>

          {/* Main Content */}
          <main className="flex-1 p-6">
            {children}
          </main>

        </div>
      </body>
    </html>
  );
}
