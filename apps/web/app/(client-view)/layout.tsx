import type { ReactNode } from "react";

// CLIENT-VIEW route-group layout (INV-020 / INV-024). The traveler surface must
// carry the AGENT'S brand only — and the document <title> + meta description are
// user-visible chrome, so without a layout here the group inherits the root
// layout's platform metadata (iteration-2 [BUG-2]: the /view tab said
// "TripForge"). This override keeps the group's metadata neutral; real client
// views will replace it with the owning agency's brand. Platform metadata stays
// in the root/(workspace) layouts only.
export const metadata = {
  title: "Your trip",
  description: "Your travel proposal and itinerary, shared by your travel agent.",
};

export default function ClientViewLayout({ children }: { children: ReactNode }) {
  return children;
}
