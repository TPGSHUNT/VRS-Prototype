// AppShell — wraps the work surface in the design language's primary container.
// Header is fixed at top (73px). Main fills the remaining viewport with no body scroll.

import { Header } from './Header';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Header />
      <main
        className="flex-1 overflow-hidden bg-gray-50 p-3"
        style={{ height: 'calc(100vh - 73px)' }}
      >
        <div className="h-full bg-white rounded-lg shadow-lg border-2 border-gray-300 relative overflow-hidden">
          {children}
        </div>
      </main>
    </div>
  );
}
