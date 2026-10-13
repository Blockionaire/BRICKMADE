import type { Metadata } from "next";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/outfit";
import "./globals.css";
import { Shell } from "@/components/shell";

export const metadata: Metadata = {
  title: "BrickMade — Your world, in bricks",
  description:
    "A private prototype for turning the things you love into personal brick builds.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a href="#page-content" className="skip-link">
          Skip to content
        </a>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
