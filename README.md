# HomeBasedGelatoNibby

**Nibby Gelato** — a playful, illustrated, mobile-first storefront for a home-based gelato business in Melaka.

[![Open the Nibby Gelato website](https://raw.githubusercontent.com/danieltan995/HomeBasedGelatoNibby/main/public/social-card.png)](https://danieltan995.github.io/HomeBasedGelatoNibby/)

## Current status

This is a working **design preview**, not a live shop. It has draft prices, MYR, a WhatsApp test-request link and an audit endpoint; availability and delivery/pickup arrangements still need confirmation. Draft pages use `noindex, nofollow`, and the generated robots response disallows crawling. These are indexing hints, not access control; keep unpublished previews private if necessary.

Initial lineup: **Lemon Almond Nibs** and **Dark Chocolate**, plus an unreleased flavour shown publicly as a grey **Mystery flavour** teaser. **Pistachio My Love** is retained in the source data for its later reveal, but has not been prepared or released and cannot be selected. No release date is promised. Planned serving size: approximately **140 ml**, in a lidded container. All artwork is original concept illustration, not photography or confirmed packaging.

## Local development

Use a supported even-numbered Node.js release **22.12+** (tested with Node 24) and npm. In this repository folder:

1. Install the locked dependencies with `npm ci`.
2. Start the local site with `npm run dev`. Default address: http://127.0.0.1:4321.
3. Check Astro/TypeScript with `npm run check`.
4. Run unit tests with `npm run test`.
5. Produce a static site with `npm run build`; output goes into `dist`.
6. Inspect the production build with `npm run preview`.
7. Install test browsers once with `npx playwright install chromium webkit`; after a build, run `npm run test:e2e`.

The Playwright suite starts its own production preview on port 4322 through Astro’s public `preview()` API, keeping the server attached to the test process even in AI-agent environments. It covers desktop Chromium and mobile WebKit, keyboard/dialog behaviour, quantities, clipboard fallback, no-JavaScript browsing, responsive overflow and automated accessibility checks. Tests never send a WhatsApp message. A VS Code preview task is also available when opening the parent Gelato workspace. If Astro reports an existing background preview, inspect it with `npx astro preview status`; stop it with `npx astro preview stop` only when you no longer need that preview.

## Edit the business and menu

- [src/data/business.ts](src/data/business.ts): brand, service area, draft/live mode, currency, WhatsApp number, public site URL, fulfilment wording and review flags.
- [src/data/flavours.ts](src/data/flavours.ts): exact product names, cup volume, illustration paths, prices, availability and confirmed ingredient/allergen text.
- [src/data/socials.ts](src/data/socials.ts): Instagram, REDnote and Facebook profile URLs; `null` displays a noticeboard card marked “Link coming soon”, opening only a local note.
- [src/styles/global.css](src/styles/global.css): design tokens, layouts, typography and motion preferences.
- [src/pages/index.astro](src/pages/index.astro): brand introduction, ordering guide and FAQ.
- [src/components](src/components): reusable header, hero, product cards, order dialog and footer.

Use `null` for unknown prices/currency/contact; never enter dummy values. Prices are integer currency minor units, e.g. **1250** represents **12.50** for MYR. `0` is a genuine zero price, not a placeholder. Do not enter currency symbols or decimals in the numeric field. The displayed subtotal is unknown if any selected price or currency is unknown.

WhatsApp numbers must be 8–15 international digits only, with country code and without `+`, punctuation or the local trunk zero. Format validation does **not** establish that the number exists or belongs to the business. Verify it manually before launch.

Availability is owner-maintained, not real-time inventory. The limit of 99 cups per flavour is a request-interface limit, not a stock claim. A data/content change requires rebuilding and redeploying.

The two revealed ingredient lists include xanthan gum as confirmed by the owner. “Working toward Muslim-friendly gelato” is an aspiration, not a verified suitability statement: review every supplier ingredient, processing aid and preparation arrangement before making stronger claims. The coming-soon mystery flavour is not covered by the two revealed lists.

### Reveal the upcoming flavour

Pistachio currently has `availability: 'coming-soon'` in [src/data/flavours.ts](src/data/flavours.ts). That state automatically replaces its name, colour, artwork and image descriptions with a grey question-mark teaser in both the menu and hero. It displays “Coming soon” rather than a price or add button. Order selections, totals and WhatsApp messages reject it, even if a selection is manually tampered with.

When it is ready, review the actual product details, allergens, volume and price, then set its availability to `available` (or `unconfirmed` only for a draft reveal). Its original name and artwork will return automatically. Update the upcoming-flavour assertions in [tests/flavour-presentation.test.ts](tests/flavour-presentation.test.ts), [tests/order.test.ts](tests/order.test.ts), [tests/whatsapp.test.ts](tests/whatsapp.test.ts) and [tests/storefront.spec.ts](tests/storefront.spec.ts), then rebuild and redeploy. Live launch still requires full review for every revealed product; a non-orderable teaser can remain upcoming. The teaser hides the identity in the storefront UI and metadata, not from people inspecting a public repository or its JavaScript/source assets.

### Interactive flavour cards

Tap/click a revealed cup to flip the artwork into flavour notes; tap “Back to cup” to return. Enter/Space toggle the focused control, and Escape returns to the illustration. Desktop hover only hints at the interaction, so it never interrupts reading. Names, prices and Add a cup stay outside the flipping area. The mystery teaser remains static and unorderable.

Reduced-motion mode swaps faces instantly. Without JavaScript, the original native “A closer look” disclosure remains available. Flavour descriptions/allergen notes share one component, [src/components/FlavourNotes.astro](src/components/FlavourNotes.astro), so both presentations stay in sync. Decorative stars, suns and hearts use inline SVG in [src/components/Doodle.astro](src/components/Doodle.astro), avoiding iOS emoji substitution.

### Connect social profiles

The footer’s **Nibby noticeboard / Follow Nibby** section has locally bundled Instagram, REDnote (Xiaohongshu) and Facebook SVG logos. Pastel cards open native notes on tap/click or keyboard activation, including without JavaScript. All three start as explicitly labelled placeholders, with no fake handles or platform-homepage links.

In [src/data/socials.ts](src/data/socials.ts), replace each `url: null` with the full HTTPS URL of the business profile after checking it belongs to you. Use a direct Instagram profile, a REDnote/Xiaohongshu user-profile URL, or a Facebook page/profile URL (including `profile.php?id=…` if needed), rather than an app share short-link. The build rejects malformed URLs, other domains and non-HTTPS schemes. Validation does not verify account ownership or existence.

Configured profiles show accessible links inside their cards that open in a new tab with `noopener noreferrer`; unconfigured platforms open only a local coming-soon note. Social links work without JavaScript and are independent of draft/live ordering mode. There are no social embeds, SDKs, tracking pixels or third-party icon requests. Rebuild and redeploy after editing the URLs. Before changing placeholders to real links, update the placeholder assertions in [tests/socials.test.ts](tests/socials.test.ts) and [tests/storefront.spec.ts](tests/storefront.spec.ts) to reflect the configured profiles; never navigate to real accounts in automated tests.

Design references: [Partake Foods](https://partakefoods.com/) for playful food branding and a dedicated community moment; [Salt & Straw](https://saltandstraw.com/) for bold flavour-led storytelling. Nibby’s artwork, layout and interactions are original; no competitor assets or code are used.

## How ordering works

The visitor selects flavours and quantities, enters their name and preferred order details, reviews the order panel, and previews a generated message. Those details live in memory until a reload or handoff; there are no accounts or local storage. Clicking Continue to WhatsApp also sends the request details to the configured audit endpoint for tracking.

In draft mode, visitors can copy a preview message or open a marked **test request** in WhatsApp after entering the required details. WhatsApp opens with the message prefilled; the visitor must still send it. Opening a link does not confirm an order or clear the selection. The owner confirms availability, final amount and fulfilment. WhatsApp’s privacy terms apply after the handoff.

Copying uses the browser clipboard on secure origins (HTTPS or localhost). If permission is denied, the message is selected for manual copying. Product information and native expandable sections remain accessible without JavaScript; the quantity builder requires it.

### Connect Google Sheets audit logging

The optional audit endpoint is implemented in [scripts/google-apps-script.gs](scripts/google-apps-script.gs). To connect it:

1. Open the target spreadsheet, create an `Orders` sheet, and open its bound Apps Script project.
2. Paste the script, run `setupOrdersSheet` once, and approve its spreadsheet permissions. This stores the spreadsheet ID for web-app executions and creates the headers.
3. Deploy the project as a web app that executes as you and is accessible to anyone who needs to submit an order. After every script change, create a new deployment version or update the existing deployment.
4. Confirm the deployed `/exec` URL returns `{"ok":true}` in a browser, then set that URL as `auditWebhookUrl` in [src/data/business.ts](src/data/business.ts) and rebuild the site.

The browser cannot read the Apps Script response cross-origin, so a successful handoff is not proof that a row was stored. Check the Apps Script execution log and the `Orders` sheet after a marked test request. The handler rejects duplicate request IDs and returns an `accepted: false` JSON result for invalid requests.

## Before switching to live

The build rejects incomplete live configuration. Do not bypass validation just to remove the draft banner.

- Check business name/trademark and domain availability; this project does not establish ownership.
- Supply confirmed currency, prices, exact serving volumes and availability statuses for all revealed flavours. Keep unreleased teasers marked `coming-soon` and unorderable.
- Replace generic product detail copy with reviewed descriptions and complete allergen information, including relevant cross-contact advice. Do not infer dietary suitability from a flavour name.
- Update the FAQ’s draft-specific serving/allergen/photography wording when details change.
- Supply and manually verify the business WhatsApp number on mobile and desktop, without sending an automated message.
- Supply a real public HTTPS site URL and clear pickup/delivery/fee/lead-time wording; no home address is required on the site.
- Confirm actual contact ownership with `contactVerified`, each product with `contentReviewed`, and final business/content review with `launchReviewed`. Set each `volumeApproximate` to false only after the serving volume is confirmed.
- Set `mode` to `live`, rebuild and inspect all copy, canonical URL and indexing behaviour.
- Complete manual keyboard, screen-reader, contrast, zoom and physical-device checks. Automated axe tests are useful but do not certify full accessibility compliance.
- Measure production performance; mobile Lighthouse 90+ is a target, not a guarantee on every device. Real-user Core Web Vitals require post-launch data.

## Hosting

The site exports ordinary static assets; no server adapter, API, credentials or database is needed. On a commercial-use-compatible static host, use this repository root as the base directory, `npm ci && npm run build` as the build command and `dist` as the publish directory. Use the supported Node version above. If importing the parent workspace rather than this Git repository, set the base directory to `HomeBasedGelatoNibby`.

Check the chosen provider’s current commercial-use terms, limits and costs before using a free plan. Do not publish until the launch checklist is complete. No deployment, domain purchase or Git push is performed by this project setup.

### Temporary GitHub Pages preview

This repository includes [.github/workflows/deploy.yml](.github/workflows/deploy.yml). Once it is committed and pushed to `main-test`, the workflow builds and deploys the static site to **https://danieltan995.github.io/HomeBasedGelatoNibby/**.

Before the first deployment, open the repository on GitHub, select **Settings** → **Pages**, and choose **GitHub Actions** as the publishing source. Thereafter, every push to `main-test` deploys; use **Actions** → **Deploy to GitHub Pages** → **Run workflow** to deploy the selected branch manually. Watch that workflow for the published URL and failures.

The Astro configuration automatically uses `/HomeBasedGelatoNibby/` only inside GitHub Actions; local preview continues to use `/`. Do not change `base` merely to test locally. GitHub Pages is publicly reachable even when a repository is private on plans that permit private Pages, so do not place private details in the preview. The draft site remains `noindex`, but that does not make the URL private.

## Artwork and fonts

See [public/ASSETS.md](public/ASSETS.md) for original artwork notes. Replace concept images with your own licensed product photos when ready, preserve their layout dimensions, and update alt text and illustration disclaimers accordingly. Photography and packaging claims must match the actual products.

Fraunces and DM Sans are self-hosted through Fontsource; see their packages’ `LICENSE` files (SIL Open Font License). No third-party font requests or stock-photo hotlinks are used. The social artwork source is [public/social-card.svg](public/social-card.svg).

## Design references

Original layout inspired by contemporary food-site design, not copied from a reference:
- [Sunbeam Bagels & Coffee — Awwwards, July 2026](https://www.awwwards.com/sites/sunbeam-bagels-coffee): playful product interactions.
- [Partake Foods — Awwwards, August 2026](https://www.awwwards.com/sites/partake-foods): consistent, colourful product branding.

No ratings, testimonials, artificial scarcity, sourcing/health claims or unverified founder history are included. The initial scope excludes payments, CMS, accounts, live inventory, analytics and multilingual content.
