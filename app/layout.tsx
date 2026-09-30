import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ONB Email Application',
  description: 'Email dispatch & scheduler app with Next.js & Tailwind CSS',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
