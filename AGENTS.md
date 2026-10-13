# AGENTS.md — Hisse Beyan

## Project context
Static website and calculators for Turkish tax reporting of foreign-stock and dividend income. Main files include `index.html`, tax-guide HTML pages, `engine.js`, `rates.json`, `yufe.json`, `rates.py`, and the Vercel configuration. Read `CLAUDE.md` for the complete page list and current deployment conventions.

## Accuracy and safety
- Treat tax calculations and explanatory text as high-impact. Do not invent tax rules, thresholds, exemptions, rates, or legal interpretations. Verify legal changes against current official Turkish sources and cite dates/sources in content when appropriate.
- Keep calculations deterministic and transparent; document assumptions, rounding, currency conversion dates, and edge cases.
- Do not change the calculation engine or rate/index data schema without checking every dependent page and test.
- Never commit credentials, API tokens, private taxpayer information, or secrets.
- Distinguish general information from professional tax advice; avoid promising that a result is an official assessment.

## Website conventions
- Preserve the existing static HTML approach and Vercel `cleanUrls` behavior unless explicitly asked otherwise.
- New guide pages should match existing metadata, canonical/OG tags, JSON-LD schema, analytics convention, breadcrumb/FAQ structure where applicable, footer legal links, and responsive/accessibility patterns.
- When adding or renaming a public page, update `sitemap.xml` and check internal links.
- Preserve the scheduled rates workflow and its timezone; validate changes to `rates.py`, `rates.json`, or workflow files carefully.
- Use Turkish with the user; timezone is Europe/Istanbul.

## Validation
- Test representative calculation cases, including boundary values, negative/zero values where relevant, rounding, and currency/date assumptions.
- Check HTML links, metadata, JSON-LD validity, and sitemap consistency after page changes.
- Do not claim tests or legal verification were completed unless actually performed. Review the diff before committing.

## Tax-calculation safeguards
- When updating tax tariffs, exemptions, declaration limits, or legal explanations, verify them against current official sources and record the applicable tax year and source date.
- Keep legal rules, calculator assumptions, and example outputs clearly distinguishable; explain material assumptions rather than presenting an estimate as an official assessment.
- Preserve or add test cases for FIFO lot matching, exchange-rate dates, Yİ-ÜFE indexation, loss offset, rounding, and threshold boundaries when those calculation paths change.

## Change-impact and release checks
- Before editing `engine.js`, tax thresholds, rates, or index data, identify affected calculators, guide pages, examples, and dependent data formats; ask before broad changes to legal or calculation behavior.
- For legal/tax changes, record the applicable tax year, official source, publication/effective date, and any assumptions. If current official verification is unavailable, mark the claim for review rather than presenting it as confirmed.
- Test normal and boundary cases for FIFO matching, currency/date selection, Yİ-ÜFE, loss offset, exemptions, rounding, and zero/negative inputs where applicable.
- After editing pages, check internal links, sitemap consistency, metadata/JSON-LD, responsive layout, and that legal caveats remain clear. After editing rate workflows, check permissions, cron timezone, and expected generated-file changes.
- Review the final diff for unrelated edits, secrets, unsupported tax claims, and mismatches between calculator behavior and explanatory examples. Report which checks ran and what remains unverified.
