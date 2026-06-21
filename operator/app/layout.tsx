import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Operator — Personal Mission Control',
  description:
    'Personal dashboard monitoring Gym, Finance, and Career with an AI Guide that surfaces what matters.',
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
