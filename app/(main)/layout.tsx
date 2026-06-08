import { Sidebar } from "@/components/layout/Sidebar";
import { ToastProvider } from "@/components/ui/ToastProvider";

/**
 * Shell for all authenticated app pages — fixed left sidebar + content area.
 * Individual pages decide their own internal layout (Home is 3-column,
 * the rest are 2-column). Wrapped in ToastProvider so any page can surface
 * brief notifications (e.g. "Lesson complete!").
 */
export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ToastProvider>
      <div className="flex min-h-screen bg-surface">
        <Sidebar />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </ToastProvider>
  );
}
