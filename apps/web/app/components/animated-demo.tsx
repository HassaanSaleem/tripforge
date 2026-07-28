// Animated, code-driven product explainer ("demo video") for the marketing
// pages — a pure-CSS scene-cycler that loops through app-styled scenes. No JS,
// no media file (server component); respects prefers-reduced-motion. Five scenes
// per variant so one keyframe timeline (see .tf-reel* in globals.css) drives both.
import type { CSSProperties, ReactNode } from "react";

type Scene = { label: string; caption: string; body: ReactNode };

const TRAVELER_SCENES: Scene[] = [
  {
    label: "Plan with AI",
    caption: "Just describe the trip.",
    body: (
      <div className="tf-reel-chat">
        <div className="tf-reel-b tf-reel-b--me">Plan a trip to Skardu, 7 days</div>
        <div className="tf-reel-b tf-reel-b--ai">Skardu · 6 nights · 2 travellers · up to $2,500. Ready to build it?</div>
        <div className="tf-reel-cta">Build my trip</div>
      </div>
    ),
  },
  {
    label: "Priced for real",
    caption: "A live, bookable itinerary.",
    body: (
      <div className="tf-reel-list">
        <div className="tf-reel-row"><span className="d d--stay" /> Boutique stay <b>$980</b></div>
        <div className="tf-reel-row"><span className="d d--activity" /> Guided valley trek <b>$420</b></div>
        <div className="tf-reel-row"><span className="d d--transfer" /> Airport transfer <b>$140</b></div>
        <div className="tf-reel-total">Trip total <b>$2,480</b></div>
      </div>
    ),
  },
  {
    label: "Your call",
    caption: "Book it, or hand it to an agent.",
    body: (
      <div className="tf-reel-fork">
        <div className="tf-reel-pill">Book it myself</div>
        <div className="tf-reel-pill tf-reel-pill--cta">Have an agent arrange it</div>
      </div>
    ),
  },
  {
    label: "Group trips",
    caption: "Plan together, confirm together.",
    body: (
      <div className="tf-reel-card">
        <b>Skardu crew · autumn</b>
        <div className="tf-reel-avatars"><span>A</span><span>O</span><span>Y</span></div>
        <div className="tf-reel-meta">2 confirmed · 1 pending</div>
      </div>
    ),
  },
  {
    label: "What's hot",
    caption: "Discover trips worth taking.",
    body: (
      <div className="tf-reel-grid">
        <div className="tf-reel-mini">Hunza Valley<span>from $1,800</span></div>
        <div className="tf-reel-mini">Reykjavik<span>from $2,400</span></div>
      </div>
    ),
  },
];

const HOME_SCENES: Scene[] = [
  {
    label: "Build with AI",
    caption: "A budget and a few words → a priced trip.",
    body: (
      <div className="tf-reel-list">
        <div className="tf-reel-chip">Budget $2,500 · 6 nights · 2 people</div>
        <div className="tf-reel-row"><span className="d d--stay" /> Stay <b>$980</b></div>
        <div className="tf-reel-row"><span className="d d--activity" /> Activities <b>$620</b></div>
        <div className="tf-reel-row"><span className="d d--transfer" /> Transfers <b>$280</b></div>
      </div>
    ),
  },
  {
    label: "Book at your markup",
    caption: "Net rate + markup — money conserved.",
    body: (
      <div className="tf-reel-money">
        <span>Net $1,000</span>
        <em>+ markup 25%</em>
        <b>Sell $1,250</b>
      </div>
    ),
  },
  {
    label: "Trade it",
    caption: "List, license & white-label finished trips.",
    body: (
      <div className="tf-reel-card">
        <b>Lisbon Getaway — white-label ready</b>
        <div className="tf-reel-meta">✓ Verified seller · 10% revenue share</div>
        <div className="tf-reel-pill tf-reel-pill--cta">License this trip</div>
      </div>
    ),
  },
  {
    label: "Travelers act",
    caption: "Plan, join & book the very same trips.",
    body: (
      <div className="tf-reel-fork">
        <div className="tf-reel-pill">Self-book</div>
        <div className="tf-reel-pill tf-reel-pill--cta">Request an agent</div>
      </div>
    ),
  },
  {
    label: "One engine, two sides",
    caption: "Demand compounds into the agent network.",
    body: (
      <div className="tf-reel-flywheel">
        <span className="tf-reel-node">Agents</span>
        <span className="tf-reel-loop" aria-hidden>⟳</span>
        <span className="tf-reel-node">Travelers</span>
      </div>
    ),
  },
];

export function AnimatedDemo({ variant }: { variant: "home" | "traveler" }) {
  const scenes = variant === "home" ? HOME_SCENES : TRAVELER_SCENES;
  return (
    <div className="tf-reel" data-variant={variant} role="img" aria-label={`Animated overview of the TripForge ${variant === "home" ? "platform" : "traveler experience"}`}>
      <div className="tf-reel-window">
        <div className="tf-reel-chrome" aria-hidden>
          <span /><span /><span />
          <em>tripforge.app</em>
        </div>
        <div className="tf-reel-stage">
          {scenes.map((scene, i) => (
            <div className="tf-reel-scene" key={i} style={{ "--i": i } as CSSProperties}>
              <div className="tf-reel-body">{scene.body}</div>
              <div className="tf-reel-cap">
                <b>{scene.label}</b>
                <span>{scene.caption}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="tf-reel-dots" aria-hidden>
        {scenes.map((_, i) => (
          <span key={i} style={{ "--i": i } as CSSProperties} />
        ))}
      </div>
    </div>
  );
}
