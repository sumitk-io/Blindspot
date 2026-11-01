::: {align="center"}
# Blindspot

**Find out what your sources don't tell you.**

An AI-assisted information-gap auditor that reveals missing details,
conflicting claims, and outdated information across multiple
sources---with evidence users can verify.

**SHINCHAN Online Hackathon 2026** · *Digital Dark Spot --- AI-Assisted
Information Gap Detection Platform*
:::

------------------------------------------------------------------------

## The Problem

People often make decisions using information scattered across multiple
websites. Search engines help find pages, and AI summarizers condense
them, but neither reliably shows whether the collected sources answer
the complete question.

Important details can remain hidden:

-   An eligibility page does not mention renewal conditions.
-   Two sources list different required documents.
-   A page describes an earlier application cycle.
-   None of the reviewed sources states a deadline.

A conventional AI answer may make incomplete information sound complete.
**Blindspot is designed to surface these gaps instead of filling them
with assumptions.**

## The Solution

Blindspot takes a research question and a set of source URLs, then
audits how well those sources address the question.

It produces an evidence-based report showing:

1.  **Coverage matrix** --- which sources address each aspect of the
    question.
2.  **Verified key facts** --- extracted claims with their original
    source quotations.
3.  **Potential information gaps** --- aspects not addressed by the
    reviewed sources, presented as unanswered questions.
4.  **Conflicting claims** --- disagreements between sources, shown with
    their supporting evidence.
5.  **Outdated information warnings** --- old, undated, or potentially
    expired information.
6.  **Verification checklist** --- prioritized suggestions for what to
    check next and where to look.

> **Important:** A gap means that information was not found in the
> sources reviewed. It does not prove that the information does not
> exist elsewhere.

## Key Features

  -----------------------------------------------------------------------
  Feature                             What it does
  ----------------------------------- -----------------------------------
  Multi-source analysis               Reads and analyzes multiple
                                      user-provided web pages.

  Coverage matrix                     Maps sources against the important
                                      aspects of a question.

  Evidence-linked findings            Shows source quotations for
                                      extracted claims.

  Quote verification                  Rejects claims whose supporting
                                      quotation cannot be located in the
                                      source text.

  Conflict detection                  Highlights cases where sources
                                      provide different information.

  Freshness checks                    Flags old, undated pages and passed
                                      deadlines where detectable.

  Verification checklist              Recommends the next facts and
                                      sources users should verify.

  Confidence indicators               Makes unreadable sources and
                                      reduced-confidence results visible.

  JSON export                         Lets users save the analysis
                                      report.

  Demo scenario                       Loads a saved example without
                                      making live AI model calls.
  -----------------------------------------------------------------------

## How It Works

Blindspot uses a structured analysis pipeline:

1.  **Question decomposition:** Breaks the research question into
    smaller, checkable aspects.
2.  **Source fetching:** Validates URLs, reads accessible pages, and
    extracts their main content.
3.  **Relevant passage retrieval:** Splits page text into sentence-based
    chunks and ranks relevant passages.
4.  **Claim extraction:** Uses Gemini to identify claims and their
    supporting quotations.
5.  **Quote verification:** Independently checks whether each quotation
    exists in the original extracted text. Unverified claims are
    discarded.
6.  **Coverage analysis:** Classifies each source/aspect combination as
    covered, partial, missing, conflicting, or unavailable.
7.  **Conflict and freshness checks:** Identifies disagreements and
    checks available date information.
8.  **Next-step ranking:** Creates a prioritized checklist to guide
    further verification.

### The Trust Mechanism

The most important part of Blindspot is its **independent quote
verifier**.

The language model may extract a claim, but it cannot make that claim
count as evidence by itself. The application checks the quotation
against the saved text of the source. If the quotation cannot be
located, the claim is rejected.

This reduces fabricated citations and makes findings easier for users
and judges to audit. Quote verification confirms that a quotation exists
in a source; it does not prove that the source itself is correct.

## What Makes Blindspot Different?

  -----------------------------------------------------------------------
  Existing approach                   Main limitation
  ----------------------------------- -----------------------------------
  Search engines                      Find information, but do not
                                      measure whether sources cover all
                                      important aspects.

  Summarizers                         Condense available information, but
                                      do not systematically identify
                                      omissions.

  General AI chatbots                 Can produce fluent answers that may
                                      hide uncertainty or unsupported
                                      assumptions.

  **Blindspot**                       Audits source coverage, verifies
                                      quotations, highlights
                                      disagreements, and guides users on
                                      what to verify next.
  -----------------------------------------------------------------------

**Our approach: We don't just answer the question. We audit the
answering.**

## Technology Stack

  -------------------------------------------------------------------------
  Layer                   Technology                Purpose
  ----------------------- ------------------------- -----------------------
  Application             Next.js 16, React 19      Frontend and
                                                    server-side API routes

  Language                TypeScript                Application logic and
                                                    shared data types

  Styling                 Tailwind CSS v4           Responsive user
                                                    interface

  AI integration          Google Gemini,            Question decomposition,
                          `@google/genai`           claim extraction, and
                                                    conflict analysis

  Web content extraction  `@mozilla/readability`,   Extracting readable
                          `jsdom`                   main content from web
                                                    pages

  Validation              Zod                       Validating model
                                                    responses and API data

  Retrieval               Custom BM25-style lexical Ranking relevant
                          scoring                   passages without a
                                                    vector database

  Evidence verification   Custom TypeScript quote   Checking extracted
                          verifier                  quotations against
                                                    source text

  Security                Custom URL/SSRF guard     Restricting unsafe URLs
                                                    and redirects

  Client-side session     `sessionStorage`          Holding the current
                                                    analysis in the browser
  -------------------------------------------------------------------------

### Why This Architecture?

-   The language model is used for language-understanding tasks;
    deterministic code handles retrieval, quote verification, and
    coverage calculations.
-   The analysis uses at most three Gemini calls, helping control
    latency and API usage.
-   No vector database or agent framework is required.
-   No application database is used; analysis is held in the browser
    session and can be exported as JSON.

## Getting Started

### Prerequisites

-   Node.js and npm
-   A Google Gemini API key from [Google AI
    Studio](https://aistudio.google.com/apikey)

### 1. Clone the repository

``` bash
git clone https://github.com/sumitk-io/Blindspot.git
cd Blindspot
```

### 2. Install dependencies

``` bash
npm install --legacy-peer-deps
```

### 3. Configure the environment

Create a `.env.local` file in the project root and add your Gemini API
key:

``` env
GEMINI_API_KEY=your_gemini_api_key_here
```

Keep this key private. Do not commit `.env.local` to GitHub.

### 4. Run the development server

``` bash
npm run dev
```

Open <http://localhost:3000> in your browser.

### 5. Run checks and build

``` bash
npm run smoke:all
npm run build
```

## Demo Mode

Blindspot includes a saved demo scenario that loads a previously
generated analysis.

-   It makes **zero Gemini API calls**.
-   It can be used when the API quota is unavailable or live source
    fetching is unreliable.
-   It is clearly labelled as a saved demo result, separate from live
    analysis.

## Limitations

-   Some websites block automated access or depend heavily on
    JavaScript. Users can paste source text when a page cannot be read.
-   Analysis is limited to the sources supplied or successfully
    accessed.
-   "Missing" means missing from the reviewed sources, not necessarily
    from the wider web.
-   Date detection is heuristic; pages without detectable dates may be
    marked undated.
-   A conflict indicates disagreement between sources. Blindspot does
    not automatically establish which source is correct.
-   Quote verification reduces fabricated citations, but cannot
    eliminate every possible model interpretation error.
-   PDF and DOCX ingestion are not currently supported by the
    source-reading pipeline.

## Future Scope

-   PDF and DOCX source ingestion.
-   Shareable, frozen analysis reports.
-   Re-checking sources when their content changes.
-   Scheduled monitoring of information gaps and conflicts.
-   Cross-lingual source analysis.
-   More domain-specific templates, such as scholarships, admissions,
    visas, and public services.
-   Search API integration for discovering relevant sources
    automatically.
-   Evaluation against manually labelled examples to measure
    gap-detection quality.

## Project Links

-   **GitHub Repository:** <https://github.com/sumitk-io/Blindspot>
-   **Live Demo:** Add deployment URL when available.
-   **Demo Video:** Add walkthrough link when available.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).

------------------------------------------------------------------------

::: {align="center"}
**Blindspot --- Find out what your sources don't tell you.**
:::
