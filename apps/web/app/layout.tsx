import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { FilterBarLoader } from "./components/FilterBarLoader";
import { NavLinks } from "./components/NavLinks";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Warehouse operations dashboard",
  description: "Warehouse operations dashboard",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <header className="shell">
          <h1>Warehouse operations dashboard</h1>
          <Suspense fallback={<div className="nav">Loading navigation...</div>}>
            <NavLinks />
          </Suspense>
          <Suspense fallback={<p>Loading filters...</p>}>
            <FilterBarLoader />
          </Suspense>
        </header>
        <main className="content">{children}</main>
      </body>
    </html>
  );
}
