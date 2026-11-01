# Blindspot — Tech Stack and Why It Fits the Problem

**Problem statement:** *Digital Dark Spot — AI-Assisted Information Gap Detection Platform.*
**Product:** an auditor that takes a question plus a handful of sources and reports what those sources **do not** tell you — with every claim tied to a quote that can be located in the page text.

This document explains the stack choice by choice, in terms of what the problem demands. It is written to be pasted into a submission form or read by a judge, not as a setup guide. Setup lives in `README.md`.

---

## 1. What the problem actually demands

"Information gap detection" is not summarisation. It inverts the usual task: instead of producing text, the system has to produce **a defensible statement of absence**. That single requirement creates six hard constraints, and every stack decision below follows from one of them.

| # | Constraint | Why it is non-negotiable |
|---|---|---|
| C1 | **Read real web pages, not a curated corpus** | The gaps people care about live on government portals and programme pages. If the tool cannot fetch and parse an arbitrary URL, it cannot detect a real gap. |
| C2 | **Never invent evidence** | A confidently stated fake gap is worse than no answer. The system must be unable to claim something a source does not say. |
| C3 | **Be auditable by a human** | "The AI says the deadline is missing" is not acceptable. The user must be able to see the exact quote, the page it came from, and when it was read. |
| C4 | **Survive the open web** | Pages block bots, time out, redirect, need JavaScript, or serve PDFs. Partial failure is the normal case, and a partial failure must degrade the answer rather than crash the run. |
| C5 | **Be explainable and deterministic where it counts** | Coverage, conflicts and rankings must be reproducible and arguable. A second model call that "judges" the first is not reproducibility. |
| C6 | **Be cheap and fast enough to demo live** | A hackathon run must finish in seconds and must still work when the quota is exhausted or the network is hostile. |

---

## 2. Stack at a glance

| Layer | Choice | Which constraint it serves |
|---|---|---|
| Application | **Next.js 16** (App Router, Route Handlers, Cache Components) + **React 19** | C1, C6 — server-side fetching without a second backend |
| Language | **TypeScript** (strict) | C3, C5 — one type contract from model output to rendered cell |
| Styling | **Tailwind CSS v4** | C3 — the coverage matrix is a grid; the UI is the audit surface |
| Page reading | **`@mozilla/readability`** + **`jsdom`** | C1, C2 — main-content extraction, not raw HTML |
| Language model | **`@google/genai`** → `gemini-3.5-flash-lite` → `gemini-3.8-flash` → `gemini-3.6-flash` | C2, C6 — language understanding only where it is required |
| Schema validation | **Zod** | C2 — a malformed model response is rejected, not rendered |
| Retrieval inside a page | **Lexical BM25-style scoring** (hand-written) | C5, C6 — deterministic, zero extra API calls |
| Hallucination control | **Custom quote verifier** in plain TypeScript | C2, C3 — the trust anchor |
| Network safety | **Custom SSRF guard** (`dns` + `net.BlockList`) | C4 — arbitrary user URLs are the primary attack surface |
| Persistence | **None** — no database, no vector store | C3, C6 — a run is one JSON object in the browser session |

---

## 3. The decisions that carry the project

### 3.1 Next.js Route Handlers instead of a separate backend (C1, C6)

Fetching a page from the browser is impossible: CORS blocks reading the response body. The key also cannot live in the client. Next.js Route Handlers give a single deployable unit where the fetch, the extraction and the model call all run server-side, and the browser receives only a finished JSON result.

The alternative — a separate Node service plus a static frontend — adds a second deployment, a second failure mode and a CORS policy for no benefit at this scale. **One repo, one deploy, one origin.**

### 3.2 Readability + jsdom instead of regex or raw `textContent` (C1, C2)

The naive approach — `document.body.textContent` — pulls in navigation menus, cookie banners, footers and "related articles". Those strings then become candidate quotes, and the model happily attributes a cookie notice to eligibility requirements.

`jsdom` parses the page into a real DOM, `@mozilla/readability` isolates the main article, and the pipeline normalises whitespace and unicode afterwards. This matters because the whole trust model depends on quotes being **locatable later**: if the extracted text is polluted, verification either fails or, worse, succeeds on boilerplate.

`jsdom` and `@mozilla/readability` are declared in `serverExternalPackages` so Next does not attempt to bundle them and they are traced as server-only dependencies.

### 3.3 Gemini, but only three calls per run (C2, C5, C6)

The model is used where language understanding is genuinely required and nowhere else:

1. **Aspect decomposition** — turn one vague question into 3–6 checkable aspects.
2. **Claim extraction** — read every source excerpt and return `{ sourceId, aspectId, statement, quote }`.
3. **Conflict adjudication** — compare only the claims that already survived verification.

Everything else — retrieval, verification, coverage scoring, conflict pre-screening, staleness, ranking — is deterministic TypeScript. This is the difference between "an LLM app" and "a system that uses an LLM as one instrument". Three calls also bound cost and latency: a measured full run is **~13 seconds**.

A fallback chain (`gemini-3.5-flash-lite` → `gemini-3.8-flash` → `gemini-3.6-flash`) exists because provider model IDs are retired; a dead model name should degrade the run, not break the product. Every response is parsed through Zod, so a malformed reply raises a typed error instead of leaking into the UI.

### 3.4 Quote verification in code — the trust anchor (C2, C3)

This is the single most important technical decision in the project, and it is deliberately **not** an LLM.

For every claim the model returns, the claimed quote is searched in the frozen page text in three escalating passes:

1. **exact** substring match;
2. **NFKC-folded** match, which absorbs curly quotes, en/em dashes, non-breaking spaces and whitespace differences;
3. **fuzzy** match with ≥90 % token containment.

A quote that cannot be located is **discarded and counted as rejected** — never rendered, never counted as coverage. A claim attributed to the wrong source is reassigned if another source contains the quote; otherwise it is dropped.

The consequence is a hard guarantee that no other layer can violate: **every fact shown on screen exists character-for-character in a page the user supplied.** In the frozen demo run, 4 claims were verified and 0 rejected, and the rejection count is displayed so the user can see the verifier doing its job.

This is why the stack includes no "LLM judge" and no self-critique loop: asking a model to check a model is not verification, it is a second opinion.

### 3.5 Lexical retrieval instead of embeddings (C5, C6)

Long pages must be trimmed before they reach the model. The conventional answer is a vector store and an embedding call per chunk. Blindspot instead splits text into sentence-aligned chunks and ranks them per aspect with a hand-written BM25-style lexical scorer.

Three reasons, all tied to the problem:

- **Deterministic.** The same page and aspects always produce the same excerpt, so a finding can be reproduced.
- **Free.** No embedding calls, no vector database, no index to keep in sync — the run stays at three model calls.
- **Explainable.** "These sentences were selected because they contain these aspect keywords" is a sentence you can put in a report; "the cosine similarity was 0.81" is not.

For a tool whose output is *absence*, retrieval quality matters less than retrieval honesty. Missing a relevant sentence produces a visible gap, which the user is then told to confirm — the failure mode is aligned with the product.

### 3.6 No database (C3, C6)

A run produces one `AnalysisData` object. That object is returned to the browser and held in `sessionStorage`; the saved demo is a committed JSON file.

This removes an entire category of risk: nothing to leak, nothing to migrate, nothing to pay for, and no source text retained on the server. It also makes the privacy claim literal — the page text is read for the duration of one request and then discarded, with only a `sha256` hash recorded for the audit trail.

The trade-off is stated openly: there is no history and no sharing by link. For a verification tool that is an acceptable cost, and the JSON export covers the "I need to keep this" case.

### 3.7 A dedicated SSRF guard (C4)

The product's core input is **an arbitrary URL chosen by a stranger**, which is the textbook server-side request forgery surface. `lib/safe-fetch.ts` enforces, before any request:

- http/https only, no credentials in the URL, ports 80/443 only;
- DNS resolution and every resolved address checked against a block list covering loopback, private ranges, link-local (cloud metadata), CGNAT, multicast and their IPv6 equivalents;
- **manual redirect following**, re-validating each hop so a redirect cannot reach an internal address;
- a 12 s per-hop timeout with a 24 s total budget, a 2 MB size cap, and a narrow content-type allowlist (PDFs are rejected explicitly rather than parsed badly).

Twelve attack cases — `localhost`, `169.254.169.254`, `192.168.x.x`, `file://`, `javascript:`, credentialed URLs, blocked ports — pass. Every rejection is a typed code with a human-readable cause and a structured server log line, so a failed source is diagnosable rather than mysterious.

---

## 4. Deliberately not used

| Not used | Why |
|---|---|
| Vector database / embeddings | Adds cost, latency and a stateful service for a retrieval step that does not need semantics; breaks the three-call budget and reproducibility. |
| Agent framework (LangChain, CrewAI, etc.) | The control flow is a fixed nine-stage pipeline. A framework would hide the ordering, which is exactly what makes the audit explainable. |
| LLM-as-judge / self-critique | Not verification. A model cannot certify that a quote exists in a page; a string search can. |
| Server-side database | Unnecessary for a single run, and turns a privacy claim into a policy claim. |
| Client-side fetching | CORS makes it impossible and it would expose the API key. |

---

## 5. Budget and failure behaviour

| Property | Value |
|---|---|
| Model calls per analysis | 3 (aspects, claims, conflicts) |
| Measured end-to-end latency | ~13 s for 3–4 sources |
| Demo mode model calls | 0 — reads a committed JSON result |
| Rate limiting | 5 runs/hour per IP, 200/day global |
| Behaviour on model failure | Falls back to heuristic extraction, marks the run **reduced confidence** |
| Behaviour on unreadable source | Source cell becomes `unavailable`, gap text says "unconfirmed rather than absent" |
| Behaviour on rejected quote | Claim dropped, rejection counted and surfaced |

The last three rows are the point. The system is designed so that **partial knowledge is displayed as partial**, rather than smoothed into a confident answer — which is precisely the failure the problem statement describes.

---

## 6. Where this stack is weakest

Stated plainly, because a judge will ask:

- **Bot-blocked sites.** Many official portals refuse automated requests. This is a property of the web, not a bug to hide: the UI states it up front and offers a paste-text path that runs the identical pipeline on copied content.
- **Conflict detection on small source sets.** With two sources covering different aspects, there is simply nothing to contradict. Value-level conflicts (percent, money, date, duration) are caught deterministically; textual ones need the model and enough overlapping evidence.
- **In-memory rate limiting.** On serverless, counters are per instance rather than global. Adequate for a demo, not a billing control.
- **Lexical retrieval** can miss a passage phrased in different vocabulary. The result is a visible gap, not a false claim — the safe direction for this product.
