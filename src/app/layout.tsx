import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "PolyWiz — Social Media Campaign Scheduler by Polymash",
  description:
    "AI-powered social media campaign generation and scheduling for arts organizations. Schedule posts across 13 platforms, powered by Zernio.",
  keywords: [
    "social media scheduler",
    "campaign generator",
    "arts organization",
    "instagram scheduler",
    "linkedin scheduler",
    "social media management",
    "content scheduling",
    "polymash",
  ],
  authors: [{ name: "Polymash Design", url: "https://polymash.com" }],
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  manifest: "/site.webmanifest",
  openGraph: {
    title: "PolyWiz — Social Media Campaign Scheduler by Polymash",
    description:
      "AI-powered social media campaign generation and scheduling for arts organizations.",
    url: "https://polymash.com",
    siteName: "PolyWiz",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "PolyWiz — Social Media Campaign Scheduler by Polymash",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "PolyWiz — Social Media Campaign Scheduler by Polymash",
    description:
      "AI-powered social media campaign generation and scheduling for arts organizations.",
    images: ["/og-image.png"],
  },
  metadataBase: new URL("https://polymash.com"),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
