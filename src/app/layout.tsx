import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'NBA Fantasy Assistant',
  description: '드래프트 · 트레이드 · 웨이버 분석 도구',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
