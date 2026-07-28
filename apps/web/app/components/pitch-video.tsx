// A code-driven, video-style pitch/demo player for the marketing pages. Not an
// MP4 — a client component that auto-plays timed, narrated scenes with a real
// progress bar, timecode, and play/pause, so it reads as a video. Reuses the
// .tf-reel-* mini-UI visuals. Respects prefers-reduced-motion (no auto-advance).
"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

type Scene = { dur: number; narr: string; sub?: string; visual: ReactNode };

const HOME_SCENES: Scene[] = [
  { dur: 13, narr: "Planning a trip is broken three ways.", sub: "AI with no real prices · supply with no experience · planners with no one accountable",
    visual: (<div className="pv-chips"><span>Pretty itineraries, fantasy prices</span><span>Wholesale supply, no client UX</span><span>AI plans, nobody accountable</span></div>) },
  { dur: 12, narr: "TripForge fixes it with one engine.", sub: "Build · Book · Trade — for agents and travelers",
    visual: (<div className="pv-mark">◇ TripForge</div>) },
  { dur: 16, narr: "Describe a trip and a budget — our AI drafts it, priced for real.", sub: "Every item on a live, bookable rate",
    visual: (<div className="tf-reel-list"><div className="tf-reel-chip">Budget $2,500 · 6 nights · 2 people</div><div className="tf-reel-row"><span className="d d--stay" /> Boutique stay <b>$980</b></div><div className="tf-reel-row"><span className="d d--activity" /> Guided trek <b>$420</b></div><div className="tf-reel-row"><span className="d d--transfer" /> Airport transfer <b>$140</b></div></div>) },
  { dur: 15, narr: "Book at net rate, apply your markup — one atomic transaction.", sub: "If any leg fails, nothing is charged. Money conserved to the cent.",
    visual: (<div className="tf-reel-money"><span>Net $1,000</span><em>+ markup 25%</em><b>Sell $1,250</b></div>) },
  { dur: 15, narr: "List, license, and white-label finished trips.", sub: "A two-sided marketplace with revenue shared automatically",
    visual: (<div className="tf-reel-card"><b>Lisbon Getaway — white-label ready</b><div className="tf-reel-meta">✓ Verified seller · 10% revenue share</div><div className="tf-reel-pill tf-reel-pill--cta">License this trip</div></div>) },
  { dur: 14, narr: "Travelers plan, join, and book the very same trips.", sub: "Self-serve — self-drive, or hand it to a vetted agent",
    visual: (<div className="tf-reel-fork"><div className="tf-reel-pill">Book it myself</div><div className="tf-reel-pill tf-reel-pill--cta">Request an agent</div></div>) },
  { dur: 13, narr: "One engine. Two sides. Demand compounds into the network.",
    visual: (<div className="tf-reel-flywheel"><span className="tf-reel-node">Agents</span><span className="tf-reel-loop" aria-hidden>⟳</span><span className="tf-reel-node">Travelers</span></div>) },
  { dur: 12, narr: "Build, book, and trade trips.", sub: "TripForge — live at tripforge-vert.vercel.app",
    visual: (<div className="pv-mark small">◇ TripForge</div>) },
];

const TRAVELER_SCENES: Scene[] = [
  { dur: 14, narr: "Just describe your trip.", sub: "Plan a trip to Skardu, 7 days…",
    visual: (<div className="tf-reel-chat"><div className="tf-reel-b tf-reel-b--me">Plan a trip to Skardu, 7 days</div><div className="tf-reel-b tf-reel-b--ai">Skardu · 6 nights · 2 travellers · up to $2,500. Ready to build it?</div></div>) },
  { dur: 14, narr: "Our AI builds it — priced for real.", sub: "A live, bookable itinerary, day by day",
    visual: (<div className="tf-reel-list"><div className="tf-reel-row"><span className="d d--stay" /> Boutique stay <b>$980</b></div><div className="tf-reel-row"><span className="d d--activity" /> Valley trek <b>$420</b></div><div className="tf-reel-row"><span className="d d--transfer" /> Transfer <b>$140</b></div><div className="tf-reel-total">Trip total <b>$2,480</b></div></div>) },
  { dur: 12, narr: "Book it yourself…", sub: "Take the plan and book each part",
    visual: (<div className="tf-reel-fork"><div className="tf-reel-pill tf-reel-pill--cta">Book it myself</div></div>) },
  { dur: 12, narr: "…or hand it to a vetted agent.", sub: "A human arranges and books it for you",
    visual: (<div className="tf-reel-fork"><div className="tf-reel-pill tf-reel-pill--cta">Have an agent arrange it</div></div>) },
  { dur: 14, narr: "Plan group trips together.", sub: "In-group chat · confirm from everyone before you finalize",
    visual: (<div className="tf-reel-card"><b>Skardu crew · autumn</b><div className="tf-reel-avatars"><span>A</span><span>O</span><span>Y</span></div><div className="tf-reel-meta">2 confirmed · 1 pending</div></div>) },
  { dur: 13, narr: "Discover trips worth taking.", sub: "Trending trips you can plan in a tap",
    visual: (<div className="tf-reel-grid"><div className="tf-reel-mini">Hunza Valley<span>from $1,800</span></div><div className="tf-reel-mini">Reykjavik<span>from $2,400</span></div></div>) },
];

function tc(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function PitchVideo({ variant }: { variant: "home" | "traveler" }) {
  const scenes = variant === "home" ? HOME_SCENES : TRAVELER_SCENES;
  const total = scenes.reduce((a, s) => a + s.dur, 0);
  const bounds = scenes.reduce<number[]>((acc, s) => [...acc, (acc[acc.length - 1] ?? 0) + s.dur], []);

  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const barRef = useRef<HTMLSpanElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const elapsed = useRef(0);

  useEffect(() => {
    const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion:reduce)").matches;
    if (reduce || !playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      elapsed.current += (now - last) / 1000;
      last = now;
      if (elapsed.current >= total) elapsed.current = 0;
      const e = elapsed.current;
      if (barRef.current) barRef.current.style.width = `${(e / total) * 100}%`;
      if (timeRef.current) timeRef.current.textContent = `${tc(e)} / ${tc(total)}`;
      let k = bounds.findIndex((b) => e < b);
      if (k === -1) k = 0;
      setIdx((prev) => (prev === k ? prev : k));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, total, bounds]);

  return (
    <div className="pv" data-variant={variant} role="img" aria-label={`TripForge ${variant === "home" ? "pitch" : "traveler demo"} video`}>
      <div className="pv-player">
        <div className="pv-stage">
          {scenes.map((s, i) => (
            <div className={`pv-scene${i === idx ? " on" : ""}`} key={i} aria-hidden={i !== idx}>
              <p className="pv-narr">{s.narr}</p>
              {s.sub ? <p className="pv-sub">{s.sub}</p> : null}
              <div className="pv-visual">{s.visual}</div>
            </div>
          ))}
        </div>
        <div className="pv-bar">
          <button type="button" className="pv-play" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause" : "Play"}>
            {playing ? "❚❚" : "▶"}
          </button>
          <div className="pv-track"><span ref={barRef} /></div>
          <span className="pv-time" ref={timeRef}>0:00 / {tc(total)}</span>
        </div>
      </div>
    </div>
  );
}
