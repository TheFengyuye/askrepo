import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AskRepo — 代码库智能问答',
  description: '索引任意 GitHub 仓库，用自然语言提问，回答带文件级引用。',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-900/70 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <a href="/" className="text-lg font-bold tracking-tight">
              AskRepo<span className="text-cyan-400">.</span>
            </a>
            <nav className="flex gap-5 text-sm text-slate-300">
              <a href="/" className="hover:text-white">
                仓库
              </a>
              <a href="/settings" className="hover:text-white">
                设置
              </a>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
