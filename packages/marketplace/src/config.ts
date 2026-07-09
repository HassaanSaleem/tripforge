// Platform-level marketplace configuration (spec 006 D-0006.b): the take rate
// applied to every license fee. A named config value — NOT a schema field —
// so a real pricing decision changes one constant, not the data model. The
// 1000 bps (10%) default is a placeholder pending the operator's pricing call
// (surfaced in spec.md "Decisions surfaced for operator review").
export const DEFAULT_PLATFORM_TAKE_RATE_BPS = 1000;
