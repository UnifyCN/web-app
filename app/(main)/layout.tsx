import { Sidebar } from "@/components/layout/Sidebar";

/**
 * Shell for all authenticated app pages — fixed left sidebar + content area.
 * Individual pages decide their own internal layout (Home is 3-column,
 * the rest are 2-column).
 */
export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-surface-gray">
      <Sidebar />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
