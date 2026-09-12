import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'NBA Fantasy Assistant | My Playbook',
  description: 'Yahoo Fantasy Basketball 읽기 전용 동기화와 예측 기반 의사결정 도구',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
