# Process overview

## What I built

An interactive explainer of Braess's paradox: predict whether more roads
always help traffic, watch a two-route network jump from 65 to 80 minutes
when a shortcut is toggled on, then check that prediction against a takeaway
scoped to this one network.

## The moments that mattered

1. **Reversing a frictionless layout back into a gated flow.** The
   continuous-scroll version showed the experiment from the start, regardless
   of any prediction. The obvious move was to leave it — it was already
   built. Instead I caught that it let a visitor skip predicting entirely,
   undercutting the point of checking a prediction afterwards, and
   restructured the page into three gated acts where predicting is a hard
   prerequisite for reaching the experiment. The same commit rewrote the
   interaction tests to assert the gate directly: `#experiment` must start
   hidden until a prediction is recorded.
   [`8a96289...7a5d78c`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-baizhenh884-dev/compare/8a96289...7a5d78c)

2. **A thrown assertion instead of trusting two calls to stay in sync.**
   Filling Act 3's content and un-hiding it were separate steps that could
   drift apart and ship an empty heading. The obvious move was to leave them
   sequential and rely on review. Instead I merged them into one function and
   added a runtime `throw` if the section would ever go visible before its
   content is filled. I verified this by running the interaction suite
   through that path and confirming the throw never fires on real content.
   [`7a5d78c`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-baizhenh884-dev/commit/7a5d78c)

3. **Retiring a disabled-button-shaped status, not just disabling it.** Once
   built, the shortcut control turned into a `<button disabled>`. The obvious
   move was to leave it — a one-line change that reads as done. Instead I
   recognised a disabled button still looks pressable to a keyboard or
   screen-reader user, and replaced it with plain, non-interactive status
   text. I knew it held because I wrote a spec assertion for it —
   `expect(status?.tagName).not.toBe("BUTTON")` — so a regression back to a
   disabled button fails the suite.
   [`ff6322d`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-baizhenh884-dev/commit/ff6322d)

4. **Throwing away the tests that pinned a one-shot design.** Act 2's
   shortcut control was one-shot: build it once, and the button retires for
   good. The obvious move, when making it toggleable, was to patch the button
   to handle removal while keeping the existing tests green with added
   branches. Instead I deleted the two tests that pinned the old behaviour —
   "retires the build control", "a retired build control cannot re-run the
   experiment" — and wrote new ones for the bidirectional contract, including
   that the reveal trigger, once earned, survives removal. The full rewritten
   suite passed, and `CLAUDE.md`'s Core interaction section was updated in
   the same commits, so contract and tests changed together.
   [`71ccda7...d72acef`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-baizhenh884-dev/compare/71ccda7...d72acef)
