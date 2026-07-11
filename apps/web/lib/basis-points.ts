// Shared percent → integer-basis-point input mapping (spec 011 research D5,
// generalized from spec 009's markup mapper): the ONE numeric conversion every
// percent-rate form input performs. Pure and DOM-free; refusals are inline
// messages that interpolate the subject noun, so each caller keeps its own
// tested wording ("Markup …" / "Revenue share …") from a single mapping.
export function percentToBps(raw: string, subject: string): { bps: number } | { error: string } {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { error: `Enter a ${subject.toLowerCase()} percentage (0–100).` };
  }
  const percent = Number(trimmed);
  if (!Number.isFinite(percent)) {
    return { error: `${subject} must be a number between 0 and 100.` };
  }
  if (percent < 0 || percent > 100) {
    return { error: `${subject} must be between 0% and 100%.` };
  }
  const bps = Math.round(percent * 100);
  // Basis points are whole: two decimal places at most (12.25% → 1225).
  if (Math.abs(percent * 100 - bps) > 1e-9) {
    return { error: `${subject} supports at most two decimal places (e.g. 12.25).` };
  }
  return { bps };
}

/**
 * Render a server-returned basis-point rate for display: 1500 → "15%",
 * 1225 → "12.25%". Scaling a rate for display is not money arithmetic — every
 * price shown next to it is the server's own integer.
 */
export function formatBps(bps: number): string {
  return `${bps / 100}%`;
}

/**
 * The inverse direction, for seeding a percent input's value from a
 * server-returned rate: 1500 → "15", 1225 → "12.25" (no "%" — this feeds a
 * form field, not display text). Same display-scaling as formatBps, not
 * money arithmetic.
 */
export function bpsToPercentInput(bps: number): string {
  return String(bps / 100);
}
