import { authorityOf } from "../lib/pipeline/model-stages.ts";
import type { SourceSnapshot } from "../lib/snapshot.ts";

const domains = [
  "chevening.org",
  "gatescambridge.org",
  "www.chevening.org",
  "en.wikipedia.org",
  "nsp.gov.in",
  "scholarships.gov.in",
  "mit.edu",
  "ox.ac.uk",
  "erasmus-plus.ec.europa.eu",
  "reddit.com",
  "scholarshiphub.org",
  "forum.example.com",
];

for (const domain of domains) {
  const authority = authorityOf({ domain } as SourceSnapshot);
  console.log(`${domain.padEnd(32)} ${authority}`);
}
