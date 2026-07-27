// Gallery image with a graceful fallback (ticket iter9-gallery-media-fallback).
// In the v0 URL-registration media model (INV-025 — URL-only, no binaries land),
// a registered URL can be unreachable or expired; a bare <img> then shows the
// browser's default broken-image glyph and ships it to the client on /view. On
// load error this swaps to a labeled placeholder tile that preserves the alt
// text, so a dead URL degrades gracefully on BOTH the client and workspace
// surfaces instead of leaking a broken glyph.
//
// The fallback keeps role="img" + the alt as its accessible name, so it is a
// drop-in a11y equivalent of the <img> it replaces (existing getByRole("img")
// gallery assertions stay valid). Client component: onError is a browser event;
// it renders fine inside server components (e.g. the /view page).
"use client";

import { useState } from "react";

interface MediaThumbImageProps {
  // Match the flexibility of the raw <img> this replaces: a registered media ref
  // may carry no url (storageKey-only) and its alt is optional.
  src: string | undefined;
  alt: string | undefined;
  className?: string;
}

export function MediaThumbImage({ src, alt, className = "tf-media-thumb" }: MediaThumbImageProps) {
  const [failed, setFailed] = useState(false);
  const label = alt && alt.length > 0 ? alt : "Image unavailable";

  // No url at all (or a failed load) → the labeled placeholder tile, never the
  // browser's broken-image glyph.
  if (failed || !src) {
    return (
      <span
        className={`${className} tf-media-thumb--fallback`}
        role="img"
        aria-label={label}
        data-testid="media-thumb-fallback"
      >
        <span className="tf-media-thumb-fallback-label" aria-hidden="true">
          {label}
        </span>
      </span>
    );
  }

  return <img src={src} alt={alt ?? ""} className={className} onError={() => setFailed(true)} />;
}
