import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RTS Arena",
  description: "Arène RTS multijoueur en temps réel",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
