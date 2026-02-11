import type { Metadata } from "next";
import "@lightspeed/unified-components-helios-theme/theme.css";

export const metadata: Metadata = {
  title: "Your App",
  description: "Lightspeed Unified Components Demo",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="uc-base">
        {children}
      </body>
    </html>
  );
}
