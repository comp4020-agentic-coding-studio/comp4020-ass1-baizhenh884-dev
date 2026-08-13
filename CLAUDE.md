# COMP4020 prototype

This is your starter repo for a COMP4020 prototype: a static site written in
HTML/CSS/TypeScript that builds to plain HTML/CSS/JS and deploys to GitHub
Pages. The **deployed site is what gets marked** --- not this repo, and not "it
works on my machine". It's marked live in Chrome against the deployed URL at two
viewports --- 1920×1080 (desktop) and 390×844 (phone) --- and both count in
full, so make that artefact good at both and use the checks below to know
whether it is.

What you're building this week — the spec — is published on the course website,
and this repo's name tells you which deliverable it is. Run the course plugin's
**start** skill at the start of each week: it pulls the right spec from the
course API, carries your harness forward from last week, and helps you turn the
spec's checkable lines into tests of your own. Read the spec before you build,
and see `spec/README.md` for how the checks in this repo relate to it.

## How to work in here

- Keep the dev server running (`pnpm dev`) so you see changes as you make them.
- Before you push, run `pnpm check`. It runs most of what CI runs --- build,
  lint, and the spec --- so you catch those in seconds instead of waiting for
  the pipeline. The links check, the evidence check, the secrets scan, and the
  deploy itself only run in CI; run `pnpm dlx linkinator ./dist --silent`
  locally against a fresh `pnpm build` for the links check without waiting for
  CI.
- To see what the page actually looks like rather than what you assume it looks
  like, open it in a browser (the `agent-browser` CLI, documented on
  [the course site](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/topics/backpressure/#agent-browser-the-rendered-page-as-ground-truth),
  works well for this). The rendered page is the truth; your mental model of it
  isn't.
- When a check fails, read its output before changing anything. Each check below
  names what it measures, and the failure message is the instruction: it tells
  you the file, the line, or the contract. Treat a red check as authoritative
  --- the page is wrong until the check is green, not until you decide it should
  be.
- Commit when the checks pass. Never commit a red state.

## The checks (your sensors)

CI runs these on every push once your repo is public. GitHub's checks UI shows
two jobs, `check` and `deploy` --- not one status per sensor below --- and
within `check` the steps run in sequence (`pnpm check` chains typecheck, build,
lint, and the spec with `&&`), so an early failure like a broken build stops the
later sensors from running for that push; fix it and push again to see the rest.
While the repo is private (all week, until you ship) the CI jobs stay skipped
--- `pnpm check` is the same roster on your machine, and it's the faster loop
anyway. They aren't hoops. Each is a different way of finding out something true
about the site that you can't reliably see by looking at it.

They also carry a mark at a crit: the sweep runs fifteen minutes after your
cutoff, and green checks there are worth half that week's shipped mark. Still
running counts as not green, so ship with time for CI to finish.

- **typecheck** --- `tsc --noEmit` runs first in `pnpm check`, so a type error
  stops the roster before the build even starts. The types are extra
  backpressure: a red here is the compiler telling you a claim in the code is
  false.
- **build** --- the site must build (`pnpm build`). A build failure means the
  deployed site is broken or stale, so nothing else matters until this is green.
- **deploy / online** --- the live GitHub Pages URL must load and return the
  page you expect. An asset that 404s on the deployed URL counts as broken even
  if it loads locally.
- **spec** --- `spec/invariants.test.ts` asserts what's true of any good
  website, whatever the week's brief asks; the tests you write for the week's
  own spec run alongside it (any `spec/*.test.ts`). A failure names the contract
  you haven't met yet.
- **lint** --- `stylelint` for CSS, `oxlint` for TypeScript. Flags code that's
  wrong, fragile, or non-idiomatic. Read the rule it names.
- **tests** --- any other tests you write, wherever you put them (co-located
  with your source is fine, not just `spec/`), must pass. Vitest picks up both
  this and the spec suite in one `vitest run`, the last step of `pnpm check`. A
  failing test is a claim about the site that's no longer true.
- **evidence** (`pnpm check:evidence`) --- checks your process evidence:
  `PROCESS.md`'s citations resolve to real commits, the current deliverable's
  exact reflection is in `reflections/` (worked out from this repo's name
  against the public course API), and your `CLAUDE.md` is present. Evidence
  gates the deploy --- `deploy` needs `check` to pass, so failing evidence
  blocks the deploy alongside everything else. See
  [Your process is part of the mark](#your-process-is-part-of-the-mark) below,
  and the course website's
  [assessment page](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/topics/assessment/#what-you-submit)
  for what counts as evidence.
- **links** --- internal links must resolve. A broken link is a dead end you
  didn't mean to ship.
- **secrets** --- the repo is scanned for committed credentials. Never put a
  key, token, or password in a tracked file. If one leaks, rotate it. A local
  pre-commit hook (`.githooks/pre-commit`, installed by `pnpm install`) also
  blocks any commit containing something shaped like an API key --- by the time
  CI sees a key it's already pushed, so the hook is the sensor that matters.

Nothing here measures **accessibility** or **performance** --- wiring those
sensors (`axe-core`, Lighthouse, or whatever you choose) is your work, and later
in the course the spec will ask you to show how you tested both. When you do,
read a green performance result honestly: it's a lab estimate from one run on a
CI machine, not proof the site is fast for real users.

## Current stack and build contract

This repository currently uses Astro, not the plain HTML/CSS/TypeScript-on-Vite
default this template starts with.

- Pages live in `src/pages/`, shared layouts in `src/layouts/`, and
  client-side TypeScript in `src/scripts/`.
- `pnpm build` must emit the complete static site to `dist/`.
- the `package.json` scripts (`check`, `check:evidence`, `build`) must keep
  working.
- whatever lands in `dist/` still passes the invariants in `spec/`.
- the deployed site lives under a path (`…github.io/<repo>/`), so the GitHub
  Pages base path must stay configured (see `astro.config.ts`'s `base`); and
  the committed `pnpm-lock.yaml` must stay in sync, since CI installs with
  `--frozen-lockfile`.

Swapping to another static stack again would only be acceptable if all of the
above still held.

## Your process is part of the mark

The deployed page is only half of it. How you got there is marked too: your
commit history, your agent files, and the decisions visible across them. The
checks above can't see any of that, so a person reads it directly --- which
means building legibly is part of building well.

- **Commit as you go.** Small, frequent commits are the record of how the work
  came together, and that record is read, not just the final state. A trail that
  grew alongside the code is the strongest evidence of your process; a single
  dump the night before is the weakest.
- **Keep a process overview** (`PROCESS.md`). A short reading-guide, not an
  essay: what you built, the moments that mattered --- each pointing at a
  commit, a `CLAUDE.md` change, or a prompt and the commit it produced --- and
  where to look in the history. It points a marker at the evidence; it doesn't
  stand in for it, and claims the history doesn't back don't count. The
  `PROCESS.md` in this repo is a template showing the shape and the citation
  format (link text the commit hash or range, target the commit or compare URL);
  `pnpm check:evidence` verifies your citations resolve to real commits before
  you ship. Markers follow those citations and don't trawl the repo for evidence
  you didn't cite.
- **Write your reflection in `reflections/`** --- a short markdown file in this
  repo, named for the deliverable it answers, so the number in the filename is
  the number in this repo's name (`crit-1.md` in `comp4020-crit1-<you>`,
  `assignment-1.md` in `comp4020-ass1-<you>`); `reflections/README.md` has the
  full rule. `pnpm check:evidence` checks the exact current name against the
  course API, not merely the presence of any well-named file. It answers the two
  standing prompts: the breakthrough that moved the work forward, and what this
  work changed about the developer you want to be. It stays out of the deployed
  site. It's due at the cutoff, and if it isn't in the repo by then the week
  doesn't count as shipped, however good the prototype is.
- **This file is process evidence.** The harness you build to direct the agent,
  this `CLAUDE.md` and any `AGENTS.md`, is itself read as part of how you
  worked. Keep it honest and current (see below).

You don't need a name, a student number, or any identity file in the repo: we
know whose repo it is. Spend the effort on the work.

## This file is yours

This CLAUDE.md is a starting point, not a fixed rulebook. As you learn what your
prototype needs --- a convention to hold the agent to, a sensor that keeps
catching you out, a fact about the stack the agent keeps getting wrong --- write
it down here. Growing this file is the work of harness engineering, and the gap
between this boilerplate and your own version is part of what your prototype
says about the developer you're becoming.

## Harness maintenance protocol

When we hit a repeated correction, a failed test, an incorrect assumption, an
issue caught in manual review, or a decision to throw out an implementation ---
pause before moving on. Ask whether it reveals a reusable working rule, not
just a one-off mistake.

If it does, propose one of:

- a change to an existing rule in this file, or
- a new automated check (a test, a lint rule, a script).

The proposal must state three things: the specific problem that triggered it
(what happened, where), the rule being proposed, and how we'll know the rule
is working (a check that fails if it's violated, or a concrete situation to
watch for next time).

Never edit this file to add or change a rule without my approval first --- show
the proposed diff and wait, every time, for every future change. This file can
hold both durable working constraints and current-project facts or contracts
--- a project-specific rule belongs here when it's explicit, testable, and
useful for directing the agent. It must not hold task lists or page-by-page
implementation plans; those live elsewhere. Because the course carries this
harness forward into next week's deliverable, review every project-specific
rule at that point --- update it, generalize it, or remove it if it no longer
applies --- rather than letting it silently persist. Once a change is
approved, commit it on its own, separate from unrelated work, so it can be
cited individually in `PROCESS.md`.

The sections below are project-specific contracts for this deliverable,
approved under this protocol. They are not a task list or an implementation
plan --- they're facts and constraints the agent should hold to while
building. Review them before carrying this harness into the next deliverable.

## Assignment 1 intent

- Build one interactive explainer of Braess's paradox.
- The point of view is: individually rational choices can produce a
  collectively worse outcome.
- Do not claim that adding roads always makes traffic worse.
- Do not add a backend, live traffic API, real map, route editor, or unrelated
  traffic phenomena.

## Core interaction

- The explainer is one static URL, laid out as a single continuous page: the
  opening question, the road-network experiment, and (once the shortcut is
  built) the explanation and takeaway all sit on the same page in that
  order, rather than switching between isolated screens.
- Opening question: the visitor is asked to respond to the general belief
  that building more roads makes traffic better. The exact question
  wording and the response options' labels are implementation choices, not
  fixed by this file. Predicting is a hard prerequisite for reaching the
  road-network experiment: it stays hidden until the visitor records a
  response.
- Recording a response reveals the experiment and its baseline: 4,000
  drivers split 2,000/2,000 across two existing routes, for a 65-minute
  trip. The response is saved for later comparison, without revealing
  whether it was right, and without hiding the question.
- The visitor can then add one new road connecting the two existing routes
  partway along their length — not a new route of its own. Adding it
  visibly changes the network's state, without a page reload: instead of
  splitting across the two original routes, all 4,000 drivers now take the
  combined path that crosses the new road, the trip becomes 80 minutes, and
  the 85-minute alternative of taking one full original route alone becomes
  visible.
- Once that result is shown, a control lets the visitor check their
  prediction on demand; only on that click does the page reveal the
  explanation and takeaway below it, responding to the visitor's saved
  response in light of it.
- The takeaway must stay narrow: this particular network is a counterexample
  showing that adding a road does not always improve traffic. It must not
  generalise to a claim that every new road makes traffic worse.
- A replay action clears the saved response and the experiment's result,
  restoring the opening question and the experiment to their starting
  state.
- Responding, adding the road, and replaying must all be keyboard-operable
  with visible focus, usable at both desktop and mobile viewports, and have
  a no-motion alternative under `prefers-reduced-motion`.

## Mathematical invariants

- Without the shortcut: `2000 / 100 + 45 = 65`.
- With the shortcut: `4000 / 100 + 0 + 4000 / 100 = 80`.
- A unilateral alternative takes `4000 / 100 + 45 = 85`.
- Displayed values must be derived from the traffic model.
- Resizing must not reset the current conceptual state, including which
  sections have been revealed and any recorded prediction.
- Essential information — scene content, results, and the prediction
  comparison — must not depend on colour or animation alone.
