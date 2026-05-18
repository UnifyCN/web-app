import { redirect } from "next/navigation";

/** The app entry point redirects straight to the Home feed. */
export default function RootPage() {
  redirect("/home");
}
