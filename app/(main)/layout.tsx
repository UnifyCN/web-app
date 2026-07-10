import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { ToastProvider } from "@/components/ui/ToastProvider";
import { LanguageSync } from "@/lib/i18n/useLanguageSync";

/**
 * Shell for all authenticated app pages. Desktop (≥ md): fixed left sidebar +
 * content. Mobile (< md): the sidebar is hidden and a fixed BottomNav takes
 * over; `<main>` reserves bottom space (nav height + safe-area inset) so page
 * content isn't hidden behind it. Wrapped in ToastProvider so any page can
 * surface brief notifications (e.g. "Lesson complete!").
 */
export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ToastProvider>
      <LanguageSync />
      <div className="flex min-h-dvh bg-surface">
        <Sidebar />
        <main className="min-w-0 flex-1 pb-[calc(3.5rem_+_env(safe-area-inset-bottom))] md:pb-0">
          {children}
        </main>
      </div>
      <BottomNav />
    </ToastProvider>
  );
}
