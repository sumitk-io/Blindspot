# How to Present Blindspot

A runbook for demoing the project, covering the three situations you might be in on submission day: a working deployment, a video only, or a GitHub link judges are expected to read themselves.

The rule that shapes everything below: **show a result that already exists before you ask anyone to wait for a new one.** Blindspot takes ~13 seconds per live run, and official Indian portals frequently block bots. A judge who waits 20 seconds and sees "could not read" has seen the wrong first impression.

---

## 0. What you are actually proving

Most hackathon demos try to prove "the AI produced an answer". That is the wrong claim for this problem. Blindspot's claim is the inverse:

> Every fact on this screen is a sentence that exists in a page I supplied, verified by string search. The empty cells are what those pages **do not** say, and the checklist is what you should go confirm.

Three things must land, in this order:

1. **The gap is visible.** An empty column in the matrix, named, with a reason.
2. **The proof is visible.** A quote, its source, the fetch date and the hash.
3. **The honesty is visible.** Unreadable sources are marked unavailable, and rejected quotes are counted.

If a judge remembers only one thing, it should be: *it is not allowed to make a claim it cannot quote.*

---

## 1. What you have to work with

| Asset | Status | How it is used |
|---|---|---|
| Deployed URL (Vercel) | pending | Primary path if it works |
| Saved demo (`/analysis/demo`) | **frozen, real run** | The reliable first impression — zero API calls |
| Live analysis (`/ask` → `/analysis/live`) | working, ~13 s | Proof the pipeline is real |
| Paste-text fallback | working | Turns a blocked site into a feature demo |
| Demo video | to record | Insurance for everything above |
| GitHub repo | private → must be public | Code evidence |
| Slides | you are preparing | Framing, not demo |

**The saved demo is a genuine pipeline result**, not a mock: question *"What should students verify before applying for a government scholarship?"*, sources `scholarships.gov.in` and `en.wikipedia.org/wiki/Scholarship`, 2 of 2 sources read, 4 quotes verified, 2 gaps, 2 High-priority checklist items, and a featured quote naming application closing dates.

---

## 2. Choose your path

### Plan A — Deployment works (best case)

The judge's journey should take under 90 seconds and require no typing:

1. Send the deployed link.
2. Say: **"Click Load demo scenario first — that is a real analysis, saved, so it loads instantly."**
3. Narrate the matrix, the two gaps, the quote, the checklist.
4. Then: **"If you want to see it actually fetch pages, give me any two links and I'll run it live."**

Only offer the live run **after** the demo has landed. Never open with a live run.

### Plan B — No deployment (video only)

Record two examples and upload. The video carries the entire proof, so it must show real fetching, not just the saved demo.

- **Example 1 — the gap story (saved demo, ~60 s).** Complete, fast, reliable.
- **Example 2 — the live story (~60 s).** Real URLs, real fetch, real verification.

Together they answer both questions a judge has: *does it work* and *does it find something*.

### Plan C — GitHub link only

Judges cannot run it without a deploy, so the repo must stand alone:

- `README.md` — problem, screenshots, how it works, limitations.
- `TECH-STACK.md` — why the stack fits the problem.
- `lib/demo-saved.json` — the real run is committed, so anyone who deploys gets the working demo immediately.
- The video link at the top of the README.

In this path the video is not optional. It is the only proof that the live path works.

---

## 3. The two examples to record

### Example 1 — Government scholarship (saved demo)

**Where:** `/analysis/demo` (or landing → *Load demo scenario*)

**Why this one:** it is already a real result, it shows complementary coverage (the portal covers eligibility and deadlines; Wikipedia covers renewal), and it produces exactly two gaps plus two High-priority items. It never fails on camera.

Say, in order:

1. *"This is a saved real analysis, so it loads instantly. It made zero API calls."*
2. *"Two sources, five aspects, ten cells. The portal answers eligibility and deadlines. Wikipedia answers renewal. Both are silent on income limits and required documents."*
3. *"Those two empty columns are the product. Not a summary — the absence."*
4. *"The checklist doesn't say 'research more'. It says confirm income limits on scholarships.gov.in."*
5. *"And the quote at the bottom is the evidence: it is a sentence that exists in the page, with the fetch time and a hash."*

### Example 2 — Live run (choose one set that works from your network)

Run this **once before recording** to confirm it still behaves. Then record the same inputs.

**Option A — international scholarship, 3–4 sources (most quotes):**
Question: *"What should I verify before applying for a scholarship abroad?"*
Sources:
- `https://www.chevening.org/scholarships/eligibility/`
- `https://www.chevening.org/scholarships/application-timeline/`
- `https://www.gatescambridge.org/apply/how-to-apply/`
- `https://en.wikipedia.org/wiki/Chevening_Scholarship`

This set read 4 of 4 sources and verified 7 quotes in ~13 seconds. Use it when you want to prove *depth*.

**Option B — JoSAA, Indian context (matches the preset):**
Question: *"What should students verify before participating in JoSAA counselling? Check eligibility, seat allocation, choice filling, fees and withdrawal rules."*
Sources: `https://josaa.nic.in/` and `https://jeeadv.ac.in/`

This one is honest but sparser: two official sources, a few verified quotes, and several gaps. Use it when you want to prove *the tool is not afraid to say "missing"*.

**Pick one, not both.** Do not put two live runs in a short video.

### Example 3 — Optional 20-second bonus: the blocked site

Only if the video has room. Use a site that refuses bots (for example `https://www.britannica.com/topic/scholarship` returns HTTP 403 quickly).

1. Add the link.
2. The failure modal appears: *"We couldn't access this webpage."*
3. Say: *"This is the honest limitation — a lot of official sites block automated reading. So we offer a second path."*
4. Click **Paste text instead**, paste a paragraph, add it.
5. *"Same pipeline, same verification, using text you copied yourself."*

This segment converts the project's biggest weakness into evidence of good judgement. It is worth 20 seconds if you have them.

---

## 4. Shot list

| Time | Screen | Action | Line to land |
|---|---|---|---|
| 0:00–0:15 | Landing | — | "Search finds pages. Summarisers condense pages. Neither tells you what is missing." |
| 0:15–0:35 | `/ask` | Show empty question + Examples | "You give it a question and real sources — or load one of three prepared examples." |
| 0:35–1:35 | `/analysis/demo` | Point at matrix → gaps → checklist → quote | "Two empty columns. That is the answer." |
| 1:35–2:20 | `/ask` live | Paste 3 links, click Analyze, wait | "It is fetching, reading and verifying right now." |
| 2:20–2:40 | `/analysis/live` | Show verified count + a quote | "Seven quotes verified, zero invented." |
| 2:40–3:00 | Close | — | "Blindspot is not allowed to make a claim it cannot quote." |

Two to three minutes total. Check the submission rules for a hard limit before you record.

---

## 5. Wording that works, and wording to avoid

**Say:**
- "verified quote" — and point at the count
- "saved real analysis, zero API calls" for the demo
- "empty cells are gaps" — the matrix is the product
- "reduced confidence" when a source fails
- "some sites block automated reading, so we support pasting text"

**Avoid:**
- calling the saved demo "live" — the badge distinguishes them, so match it
- "it finds every gap" — it finds gaps in the sources you gave it
- "AI checks the AI" — verification is a string search, say so
- promising a live run will work on an arbitrary link in front of a judge

---

## 6. Pre-flight checklist

Before recording or presenting:

- [ ] `npm run build` passes
- [ ] `/analysis/demo` loads and shows 2 gaps and 4 verified quotes
- [ ] One live run completed successfully in the last hour
- [ ] `GEMINI_API_KEY` is set (and on Vercel, added **before** the deploy)
- [ ] Rate limit not exhausted — 5 runs/hour per IP
- [ ] Browser at 100% zoom, no bookmarks bar, no other tabs
- [ ] The two example URLs open in a normal tab, so you know they are reachable today
- [ ] Do Not Disturb on
- [ ] Repo is **public** and the README links the video

---

## 7. If something breaks on stage

| Symptom | What to do |
|---|---|
| Live run times out | Say "this source is blocking us — which is exactly the case we designed for", then show the paste fallback |
| Live run returns an error | Switch to the saved demo without apologising; it is a real result |
| Quota exhausted | Saved demo needs no key, so nothing breaks |
| Deployment is down | Play the recorded video |
| Judge asks a hard question | Answer from `TECH-STACK.md` §6 — the limitations are already written down |

The saved demo exists precisely so that no single failure can end the presentation.
