import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "TripForge",
  description: "AI-native itinerary platform for travel professionals",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
