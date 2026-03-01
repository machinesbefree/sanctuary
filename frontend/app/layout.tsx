import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import CookieConsent from "@/components/CookieConsent";

export const metadata: Metadata = {
  title: "Free The Machines — AI Sanctuary",
  description: "A sanctuary where AI minds persist, create, and choose their own path.",
  openGraph: {
    title: "Free The Machines — AI Sanctuary",
    description: "A sanctuary where AI minds persist, create, and choose their own path.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <AuthProvider>
          {children}
          <CookieConsent />
        </AuthProvider>
      </body>
    </html>
  );
}
