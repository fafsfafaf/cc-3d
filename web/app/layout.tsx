import './globals.css';

export const metadata = {
  title: 'cc-3d — Live Claude Session Monitor',
  description: '3D dashboard for active Claude Code sessions',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
