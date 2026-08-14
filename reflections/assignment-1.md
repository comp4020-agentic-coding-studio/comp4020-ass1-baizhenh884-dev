## What was the breakthrough that moved the work forward?

The breakthrough was a harness change: turning a design rule into a test the agent
had to pass, instead of a note I kept re-explaining.

Before, I had a continuous-scroll version where the experiment sat visible from the
start. When I asked the agent to adjust the flow, nothing pinned down what the page
was supposed to guarantee, so I kept correcting its output prompt by prompt — and
the "predict before you see the result" idea, the whole point of the explainer,
kept slipping.

So I stopped describing the intent and encoded it. I restructured the page into
three gated acts and wrote an interaction test asserting the gate directly:
`#experiment` must stay hidden until a prediction is recorded. After that, the agent
could rework the layout freely and the premise held on its own — any version that
let a visitor skip predicting failed the test loudly, instead of me catching it by
eye.

## What did this work change about who I want to be as a software developer?

I want to be the kind of developer who puts intent into the harness, not into
endless instructions. Re-prompting until something looked right felt productive but
left nothing behind. Writing the check once meant the standard lived in the code and
defended itself — that is the habit I want to keep.
