# Strix Product Rules

Engineering and design principles for anyone working on this codebase.

## 1. Always show the user exactly the number of results they requested

Search results must display exactly the count the user selected in the wizard. No more, no fewer. Internal buffers, theme distributions, and image filtering are implementation details — the user sees their number. If something causes a mismatch (e.g. image filtering hides cards), fix the root cause rather than surface a different count.

## 2. The count slider maximum is a hard contract

Whatever `COUNT_MAX` is set to, the system must be able to deliver that many results. If the max is 30, a search for 30 must return 30. If the architecture cannot reliably deliver a count at the slider's maximum, fix the architecture — do not lower the maximum. The slider range is a user-facing capability promise; reducing it to paper over a performance or reliability problem is never acceptable.

## 3. Never reduce user capability as a fix for a performance or reliability problem

If the system is slow or unreliable at high counts, fix the underlying architecture. Do not suggest removing features, lowering limits, hiding options, or otherwise degrading what users can do. Performance problems require performance solutions: better streaming, smarter distribution, faster models, caching. Capability reductions are a last resort requiring explicit product sign-off, not a first suggestion.

## 4. Cost per result is critical — flag increases upfront

Any feature that adds an API call, increases output tokens, or otherwise raises the per-search cost must be called out explicitly before implementation, with the estimated cost impact and at least one lower-cost alternative. Examples of cost-increasing changes: adding a second Claude call, increasing description length, fetching more Brave results per gift, adding image re-ranking steps.

## 5. Speed to first result is critical — flag regressions upfront

Any feature that delays when the first gift card appears must be called out explicitly before implementation, with the estimated latency impact and at least one faster alternative. The target is first cards visible within 10 seconds for a default 9-gift search. Changes that push this above 15 seconds require explicit sign-off. Examples of speed-reducing changes: increasing per-theme gift count, adding a synchronous pre-processing step, switching to a slower model.

## 6. Dev observability: the system must signal what it is doing at all times

Any async operation that takes more than 2 seconds must emit a log line when it starts, not only when it finishes. For the search flow specifically: a log line must fire immediately before the Anthropic API call (e.g. `[anthropic] calling Claude — N gifts across 3 themes`) so developers can distinguish "waiting for Claude" from "something silently failed." Silent waits are not acceptable in a system with 10–60 second operations.
