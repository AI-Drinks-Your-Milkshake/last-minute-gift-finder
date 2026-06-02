// Single production model. We settled on Haiku 4.5 after benchmarking it at
// ~2.3x faster than Sonnet and fixing the tolerant parser that let its output
// through (it emits prices as strings, which the old strict validator rejected).
// Sonnet has been dropped. If a second model is ever needed, reintroduce a
// registry here.
export const MODEL = 'claude-haiku-4-5';
