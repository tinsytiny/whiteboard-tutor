import type { Metadata, Viewport } from "next";
import { Inter, Kalam } from "next/font/google";
import "katex/dist/katex.min.css";
import "./globals.css";
import { APP_NAME } from "@/lib/brand";

const ui = Inter({ variable: "--font-ui", subsets: ["latin"] });
const hand = Kalam({ variable: "--font-hand", subsets: ["latin"], weight: ["400", "700"] });

export const metadata: Metadata = {
  title: APP_NAME,
  description: "A tutor that talks it through and writes every step on the board.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${ui.variable} ${hand.variable} h-full antialiased`}>
      <body className="h-full font-sans">{children}</body>
    </html>
  );
}
