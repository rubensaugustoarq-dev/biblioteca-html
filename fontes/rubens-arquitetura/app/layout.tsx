import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Rubens Augusto | Arquiteto e Urbanista",
  description:
    "Arquitetura residencial, habitação popular, ambientes comerciais, interiores e projetos BIM em Rio Branco, Acre, com atendimento presencial e online.",
  metadataBase: new URL(
    "https://rubensaugustoarq-dev.github.io/biblioteca-html/projetos/rubens-arquitetura",
  ),
  alternates: { canonical: "/biblioteca-html/projetos/rubens-arquitetura/" },
  openGraph: {
    title: "Rubens Augusto | Arquiteto e Urbanista",
    description:
      "Projetos de arquitetura, interiores e BIM com precisão técnica, estética e soluções viáveis.",
    url: "/biblioteca-html/projetos/rubens-arquitetura/",
    siteName: "Rubens Augusto — Arquiteto e Urbanista",
    locale: "pt_BR",
    type: "website",
    images: [
      {
        url: "/biblioteca-html/projetos/rubens-arquitetura/og-rubens.jpg",
        width: 1200,
        height: 630,
        alt: "Rubens Augusto — Arquitetura e Urbanismo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Rubens Augusto | Arquiteto e Urbanista",
    description: "Arquitetura, interiores e BIM em Rio Branco, Acre.",
    images: ["/biblioteca-html/projetos/rubens-arquitetura/og-rubens.jpg"],
  },
  robots: { index: true, follow: true },
  icons: { icon: "/biblioteca-html/projetos/rubens-arquitetura/favicon.png", shortcut: "/biblioteca-html/projetos/rubens-arquitetura/favicon.png" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <head>
        <link
          rel="preload"
          href="/biblioteca-html/projetos/rubens-arquitetura/hero-rubens.webp"
          as="image"
          type="image/webp"
        />
      </head>
      <body className={poppins.variable}>{children}</body>
    </html>
  );
}
