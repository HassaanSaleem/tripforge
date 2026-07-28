// A continuous, code-driven animated explainer of what TripForge is — NOT a
// slideshow. A spinning "engine" core with a stream of particles flowing around
// a flywheel ring, energizing four stations (Build -> Book -> Trade -> Travel)
// in sequence, between the two sides it serves. Pure CSS animation (server
// component); respects prefers-reduced-motion.
import type { CSSProperties } from "react";

const DOTS = Array.from({ length: 12 });

export function EngineAnimation() {
  return (
    <div className="fw" role="img" aria-label="Animated diagram: the TripForge engine and its two-sided flywheel, particles flowing from agents through Build, Book, Trade, to Travelers and back">
      <p className="fw-head">One engine · two sides</p>
      <div className="fw-scene">
        <div className="fw-side fw-side--l"><b>Agents</b><span>build · book · list</span></div>

        <div className="fw-ring">
          <div className="fw-orbits">
            {DOTS.map((_, i) => (
              <div className="fw-orbit" key={i} style={{ "--i": i } as CSSProperties}>
                <span className="fw-dot" />
              </div>
            ))}
          </div>
          <div className="fw-wp fw-wp--n"><i /> Build</div>
          <div className="fw-wp fw-wp--e"><i /> Book</div>
          <div className="fw-wp fw-wp--s"><i /> Trade</div>
          <div className="fw-wp fw-wp--w"><i /> Travel</div>
          <div className="fw-core">
            <span className="fw-core-mark">◇</span>
            <em>one engine</em>
          </div>
        </div>

        <div className="fw-side fw-side--r"><b>Travelers</b><span>plan · join · book</span></div>
      </div>
      <p className="fw-foot">The same trip — built, booked, and traded. Priced for real, never forked.</p>
    </div>
  );
}
