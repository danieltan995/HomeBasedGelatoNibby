import AxeBuilder from '@axe-core/playwright';
import { test as base, expect, type Page } from '@playwright/test';

// Exercise the built storefront, not imports of its implementation/data helpers.
// Both browser/device projects and the production preview URL come from the config.
const menu = [
  { id: 'lemon-almond-nibs', name: 'Lemon Almond Nibs', theme: 'lemon' },
  { id: 'dark-chocolate', name: 'Dark Chocolate', theme: 'cocoa' },
  { id: 'pistachio-my-love', name: 'Mystery flavour', theme: 'mystery' },
] as const;
const [lemon, chocolate, mystery] = menu;
const selectableMenu = [lemon, chocolate];
type Flavour = (typeof menu)[number];
type MessageLine = readonly [Flavour, number];

// Install before navigation, including in the JavaScript-disabled project context.
// Never contact an external service, even if a future regression adds a redirect
// or popup. Every order flow also fails on unhandled browser exceptions.
const test = base.extend<{ storefrontSafety: void }>({
  storefrontSafety: [async ({ context, baseURL }, use) => {
    if (!baseURL) throw new Error('These tests require the configured preview baseURL.');
    const origin = new URL(baseURL).origin;
    const externalRequests: string[] = [];
    const pageErrors: string[] = [];
    const watchPage = (page: Page) => {
      page.on('pageerror', (error) => pageErrors.push(error.message));
    };
    context.pages().forEach(watchPage);
    context.on('page', watchPage);
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) {
        externalRequests.push(`${route.request().method()} ${url.origin}${url.pathname}`);
        await route.abort();
      } else {
        await route.continue();
      }
    });
    await use();
    expect.soft(pageErrors, 'No browser pageerror, including throughout order flows').toEqual([]);
    expect.soft(externalRequests, 'No outbound requests or external navigation').toEqual([]);
  }, { auto: true }],
});

const headerBag = (page: Page) => page.locator('.bag-button[data-open-order]');
const drawer = (page: Page) => page.locator('#order-dialog');
const closeButton = (page: Page) => drawer(page).locator('.drawer-header [data-close-order]');
const card = (page: Page, flavour: Flavour) => page.locator(`[data-card="${flavour.id}"]`);
const row = (page: Page, flavour: Flavour) => drawer(page).locator(`[data-line="${flavour.id}"]`);
const message = (page: Page) => drawer(page).locator('#order-message');

async function settleVisuals(page: Page) {
  // Only used with JavaScript enabled: animation-frame callbacks do not run
  // reliably in script-disabled contexts. Native fallback assertions need no JS wait.
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const finiteAnimations = document.getAnimations().filter((animation) =>
      animation.playState === 'running' && animation.effect?.getTiming().iterations !== Infinity,
    );
    await Promise.all(finiteAnimations.map((animation) => animation.finished.catch(() => undefined)));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
}

async function visitStorefront(page: Page, enhanced = true) {
  const response = await page.goto('/');
  expect(response?.ok(), 'Production preview serves the homepage successfully').toBe(true);
  if (enhanced) {
    await expect(headerBag(page)).toBeVisible();
    await settleVisuals(page);
  }
}

async function addCup(page: Page, flavour: Flavour) {
  await card(page, flavour).locator(`[data-add="${flavour.id}"]`).click();
}

async function openOrder(page: Page) {
  // The sticky mobile bag has the same attribute/name; never use an unscoped opener.
  await headerBag(page).click();
  await expect(drawer(page)).toBeVisible();
  await expect(drawer(page)).toHaveAccessibleName(/your.*cups/i);
}

async function expectCount(page: Page, count: number) {
  await expect(headerBag(page).locator('[data-count]')).toHaveText(String(count));
  await expect(page.locator('[data-mobile-bag] [data-count]')).toHaveText(String(count));
}

async function expectEmptyOrder(page: Page) {
  await expect(drawer(page).locator('[data-line]')).toHaveCount(0);
  await expect(drawer(page).locator('[data-empty-order]')).toBeVisible();
  await expect(drawer(page).locator('[data-order-summary]')).toBeHidden();
  await expect(message(page)).toHaveValue('');
  await expectCount(page, 0);
}

async function expectMessage(page: Page, lines: readonly MessageLine[]) {
  for (const [flavour, quantity] of lines) {
    // Exact menu names/quantities are a contract; surrounding marketing copy is not.
    await expect(message(page)).toHaveValue(new RegExp(`(?:^|\\n)${quantity}\\s*×\\s*\\*?${flavour.name}\\*?(?:\\n|$)`, 'i'));
  }
  for (const flavour of menu) {
    if (!lines.some(([selected]) => selected.id === flavour.id)) {
      await expect(message(page)).not.toHaveValue(new RegExp(flavour.name));
    }
  }
  const lineItems = (await message(page).inputValue()).match(/^\d+\s*×\s/gm) ?? [];
  expect(lineItems).toHaveLength(lines.length);
  await expect(message(page)).not.toHaveValue(/pistachio|mystery/i);
}

async function expectNoWhatsAppDestination(page: Page) {
  await expect(page.locator(
    'a[href*="wa.me"], a[href*="api.whatsapp.com"], a[href*="web.whatsapp.com"], a[href^="whatsapp:"]',
  )).toHaveCount(0);
  await expect(drawer(page).locator('[data-whatsapp]')).toBeHidden();
  await expect(drawer(page).locator('[data-whatsapp][href]')).toHaveCount(0);
}

test('draft metadata and exact menu names are present without an outbound ordering destination', async ({ page }) => {
  await visitStorefront(page);
  await expect(page).toHaveTitle(/Nibby Gelato\s*\|\s*Home-based gelato in Melaka/i);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /\bnoindex\b/i);
  await expect(page.locator('.preview-bar')).toBeVisible();
  await expect(page.locator('#flavours [data-card]')).toHaveCount(3);
  await expect(page.locator('#flavours [data-card] h3')).toHaveText(menu.map(({ name }) => name));
  await expect(page.locator('.menu-suitability-note')).toContainText('Working toward Muslim-friendly gelato.');
  await expect(page.locator('.menu-suitability-note')).toContainText('still checking ingredient sources and preparation');
  await expect(card(page, lemon).locator('.flavour-notes')).toContainText('Xanthan gum');
  await expect(card(page, chocolate).locator('.flavour-notes')).toContainText('Xanthan gum');
  await expect(page.locator('body')).not.toContainText(/\bhalal\b/i);
  await expectNoWhatsAppDestination(page);

  await addCup(page, lemon);
  await openOrder(page);
  await expect(drawer(page).locator('[data-send-disabled]')).toBeVisible();
  await expect(drawer(page).locator('[data-send-disabled]')).toBeDisabled();
  await expect(drawer(page).locator('[data-subtotal]')).toContainText(/RM\s*11\.90/i);
  await expect(message(page)).toHaveValue(/draft/i);
  await expect(message(page)).toHaveValue(/not an order/i);
  await expectNoWhatsAppDestination(page);
});

test('collects request details before enabling the WhatsApp order link', async ({ page }) => {
  await visitStorefront(page);
  await addCup(page, lemon);
  await openOrder(page);

  const details = drawer(page).locator('[data-request-details]');
  await details.locator('[data-request-field="customerName"]').fill('Aina');
  await details.locator('[data-request-field="preferredDate"]').fill('2026-09-12');
  await details.locator('[data-request-field="preferredTime"]').fill('15:30');
  await details.locator('[data-request-field="fulfilment"]').selectOption('delivery');
  await expect(details.locator('[data-delivery-area]')).toBeVisible();
  await details.locator('[data-request-field="deliveryArea"]').fill('Ayer Keroh');

  const sendLink = drawer(page).locator('[data-whatsapp]');
  await expect(sendLink).toBeVisible();
  await expect(sendLink).toHaveAttribute('href', /https:\/\/wa\.me\/60172688120\?text=/);
  await expect(message(page)).toHaveValue(/Name: Aina/);
  await expect(message(page)).toHaveValue(/Preferred date: 2026-09-12/);
  await expect(message(page)).toHaveValue(/Fulfilment: Delivery to Ayer Keroh/);
  await expect(message(page)).not.toHaveValue(/140\\s*ml|lidded cup/i);
});

test('the complete header stays visible while scrolling, keeping the selected cups reachable', async ({ page }) => {
  await visitStorefront(page);
  await addCup(page, lemon);
  await page.locator('.site-footer').scrollIntoViewIfNeeded();
  await expect(page.locator('.header-shell')).toHaveCSS('position', 'sticky');
  await expect.poll(() => page.locator('.header-shell').evaluate((node) => Math.round(node.getBoundingClientRect().top)))
    .toBe(0);
  await expect(page.locator('.header-shell')).toBeInViewport();
  await expect(headerBag(page)).toBeVisible();
  await headerBag(page).click();
  await expect(drawer(page)).toBeVisible();
  await expect(row(page, lemon)).toBeVisible();
});

async function expectSocialPlaceholders(page: Page) {
  const socials = page.getByRole('region', { name: 'Follow Nibby.' });
  await socials.scrollIntoViewIfNeeded();
  await expect(socials).toBeVisible();
  await expect(socials.getByRole('listitem')).toHaveCount(3);
  await expect(socials.locator('.social-name')).toHaveText(['Instagram', 'REDnote', 'Facebook']);
  await expect(socials.getByText('Link coming soon', { exact: true })).toHaveCount(3);
  await expect(socials.locator('[data-state="pending"]')).toHaveCount(3);
  await expect(socials.locator('a[href], button, [tabindex]')).toHaveCount(0);
  await expect(socials.locator('details > summary')).toHaveCount(3);
  await expect(socials.locator('svg[aria-hidden="true"][focusable="false"] path')).toHaveCount(3);
  for (const icon of await socials.locator('svg').all()) {
    await expect(icon).toBeVisible();
    expect(await icon.locator('path').getAttribute('d')).toMatch(/^M/);
  }
}

test('social noticeboard opens local notes without pretending profile links are live', async ({ page }) => {
  await visitStorefront(page);
  await expectSocialPlaceholders(page);
  for (const note of await page.locator('.social-card').all()) {
    await note.locator('summary').click();
    await expect(note).toHaveJSProperty('open', true);
    await expect(note.locator('.social-note')).toBeVisible();
    await note.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(note).toHaveJSProperty('open', false);
  }
});

test('decorative stars, hearts, suns and arrows use vectors instead of emoji glyphs', async ({ page }) => {
  await visitStorefront(page);
  await expect(page.locator('body')).not.toContainText(/[✳✧♡☀↗↙↳]/u);
  await expect(page.locator('.wordmark-star svg, .hero-spark svg, .ribbon svg, .footer-wordmark svg')).toHaveCount(8);
  for (const icon of await page.locator('.doodle').all()) {
    await expect(icon).toHaveAttribute('aria-hidden', 'true');
    await expect(icon).toHaveAttribute('focusable', 'false');
  }
});

test('all three main navigation links stay present and reachable on narrow mobile widths', async ({ page }) => {
  await visitStorefront(page);
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  const names = ['Our flavours', 'A little about us', 'How to order'];
  for (const width of [360, 390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    for (const name of names) {
      const link = nav.getByRole('link', { name, exact: true });
      await expect(link).toBeAttached();
      await expect(link).not.toBeHidden();
    }
    // Every link is reachable via the nav's own horizontal scroll, not clipped off-screen.
    const lastLink = nav.getByRole('link', { name: names[names.length - 1], exact: true });
    await lastLink.evaluate((node) => node.scrollIntoView({ behavior: 'instant', inline: 'nearest' }));
    const box = await lastLink.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
  }
  await page.setViewportSize({ width: 390, height: 900 });
  await nav.getByRole('link', { name: 'How to order', exact: true }).evaluate((node) => node.scrollIntoView({ behavior: 'instant', inline: 'nearest' }));
  await nav.getByRole('link', { name: 'How to order', exact: true }).click();
  await expect(page).toHaveURL(/#how-to-order$/);
});

test('revealed and mystery flavour art, names and actions align across the desktop row', async ({ page }) => {
  await visitStorefront(page);
  for (const width of [768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await settleVisuals(page);
    const cards = await page.locator('.flavour-card').evaluateAll((nodes) => nodes.map((node) => {
      const art = node.querySelector('.flip-front')!.getBoundingClientRect();
      const heading = node.querySelector('h3')!.getBoundingClientRect();
      const action = node.querySelector('.product-bottom')?.getBoundingClientRect();
      return { artTop: art.top, artBottom: art.bottom, artRight: art.right, headingTop: heading.top, actionTop: action?.top };
    }));
    for (const item of cards) {
      expect(Math.abs(item.artTop - cards[0].artTop)).toBeLessThanOrEqual(1);
      expect(Math.abs(item.artBottom - cards[0].artBottom)).toBeLessThanOrEqual(1);
      expect(Math.abs(item.headingTop - cards[0].headingTop)).toBeLessThanOrEqual(1);
      expect(item.artRight).toBeLessThanOrEqual(width + 1);
    }
    expect(Math.abs(cards[1].actionTop! - cards[0].actionTop!)).toBeLessThanOrEqual(1);
    await card(page, lemon).locator('[data-flip-toggle]').click();
    await expect(card(page, lemon).locator('.flip-back')).toBeVisible();
    await card(page, lemon).locator('[data-flip-toggle]').click();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  }
});

test('flavour art flips on activation, stays readable and leaves ordering controls in place', async ({ page, isMobile }) => {
  await visitStorefront(page);
  for (const flavour of selectableMenu) {
    const product = card(page, flavour);
    const flip = product.locator('[data-flip-card]');
    const toggle = product.locator('[data-flip-toggle]');
    const back = product.locator('.flip-back');
    await flip.scrollIntoViewIfNeeded();
    await settleVisuals(page);
    if (!isMobile) {
      // Hovering previews the notes visually but does not pin them open.
      await toggle.hover();
      await expect(flip.locator('.flip-stage')).toHaveCSS('transform', /matrix3d|rotate/);
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await page.mouse.move(0, 0);
      await expect(flip.locator('.flip-stage')).toHaveCSS('transform', 'none');
    }
    const before = await product.locator('.product-info').boundingBox();
    // Click the image area rather than only the small hint at its bottom.
    await toggle.click({ position: { x: 70, y: 90 } });
    await settleVisuals(page);
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(back).toHaveAttribute('aria-hidden', 'false');
    await expect(back).toHaveJSProperty('inert', false);
    await expect(product.locator('.flip-front')).toHaveJSProperty('inert', true);
    await expect(back).toContainText('A little allergy note');
    await expect(product.getByRole('img')).toHaveCount(0);
    const after = await product.locator('.product-info').boundingBox();
    expect(Math.abs(after!.y - before!.y)).toBeLessThanOrEqual(1);
    await addCup(page, flavour);
    // Clicking anywhere on the pinned-open card, not just the hint, flips it back.
    await toggle.click({ position: { x: 70, y: 90 } });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await toggle.focus();
    await page.keyboard.press('Escape');
    await expect(toggle).toBeFocused();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('Space');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  }
  await expectCount(page, 2);
  await expect(card(page, mystery).locator('[data-flip-toggle]')).toHaveCount(0);
});

test('flavour notes fit at every breakpoint, including enlarged text and reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await visitStorefront(page);
  for (const width of [360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const product of await page.locator('[data-flip-card]').all()) {
      const toggle = product.locator('[data-flip-toggle]');
      await toggle.click();
      await expect(product.locator('.flip-stage')).toHaveCSS('transform', 'none');
      await expect(product.locator('.flip-stage')).toHaveCSS('transition-duration', '0s');
      await expect(product.locator('.flip-front')).toHaveCSS('visibility', 'hidden');
      const notes = product.locator('.flavour-notes');
      const notesBox = await notes.boundingBox();
      const hintBox = await product.locator('.flip-hint').boundingBox();
      expect(notesBox!.y + notesBox!.height).toBeLessThanOrEqual(hintBox!.y);
      expect(await product.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
      await toggle.click();
    }
  }
  await page.addStyleTag({ content: '.flavour-notes, .flavour-notes .flavour-availability { font-size: 24px !important; }' });
  const product = card(page, lemon);
  await product.locator('[data-flip-toggle]').click();
  const notesBox = await product.locator('.flavour-notes').boundingBox();
  const hintBox = await product.locator('.flip-hint').boundingBox();
  expect(notesBox!.y + notesBox!.height).toBeLessThanOrEqual(hintBox!.y);
});

test('floating Back to top works throughout the page and stays clear of the cart', async ({ page, isMobile }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await visitStorefront(page);
  const backTop = page.locator('.back-top');
  await expect(page.getByRole('link', { name: 'Back to top', exact: true })).toHaveCount(1);
  await expect(backTop).toHaveAttribute('href', '#home');
  await expect(backTop).toHaveCSS('position', 'fixed');
  await expect(backTop).toBeInViewport();
  await expect(backTop).toHaveCSS('transition-duration', '0s');

  for (const section of ['#flavours', '#our-story', '.site-footer']) {
    await page.locator(section).evaluate((node) => node.scrollIntoView({ behavior: 'instant' }));
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(100);
    await expect(backTop).toBeInViewport();
    await backTop.click();
    await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThanOrEqual(1);
  }

  await addCup(page, lemon);
  await page.locator('.site-footer').evaluate((node) => node.scrollIntoView({ behavior: 'instant' }));
  const arrowBox = await backTop.boundingBox();
  expect(arrowBox!.width).toBeGreaterThanOrEqual(44);
  expect(arrowBox!.height).toBeGreaterThanOrEqual(44);
  if (isMobile) {
    const bagBox = await page.locator('[data-mobile-bag]').boundingBox();
    expect(bagBox!.x + bagBox!.width + 8).toBeLessThanOrEqual(arrowBox!.x);
    const toastBox = await page.locator('[data-toast]').boundingBox();
    expect(toastBox!.y + toastBox!.height).toBeLessThanOrEqual(arrowBox!.y);
  }
  // Enter keyboard modality, then focus the target explicitly: mobile WebKit
  // does not necessarily include links in its default sequential Tab order.
  await page.keyboard.press('Tab');
  await backTop.focus();
  await expect(backTop).toBeFocused();
  await expect(backTop).toHaveCSS('outline-style', 'solid');
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThanOrEqual(1);
  await expectCount(page, 1);
  await openOrder(page);
  await expect(backTop).toBeHidden();
  await closeButton(page).click();
  await expect(backTop).toBeVisible();
});

test('the compact footer keeps social cards side by side without overflowing', async ({ page }) => {
  await visitStorefront(page);
  for (const width of [360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await settleVisuals(page);
    const footer = await page.locator('.site-footer').boundingBox();
    expect(footer!.height, `Compact footer at ${width}px`).toBeLessThan(width <= 600 ? 540 : 400);
    const cards = await page.locator('.social-card').all();
    const boxes = await Promise.all(cards.map((card) => card.boundingBox()));
    expect(boxes).toHaveLength(3);
    for (const box of boxes) {
      expect(Math.abs(box!.y - boxes[0]!.y)).toBeLessThanOrEqual(1);
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    }
  }
});

async function expectMysteryTeaser(page: Page) {
  const teaser = card(page, mystery);
  await expect(teaser).toHaveAttribute('data-availability', 'coming-soon');
  await expect(teaser).toHaveClass(/theme-mystery/);
  await expect(teaser.getByRole('heading', { name: 'Mystery flavour', exact: true })).toBeVisible();
  await expect(teaser.locator('img')).toHaveAttribute('src', '/illustrations/mystery-cup.svg');
  await expect(teaser.locator('img')).toHaveAttribute('alt', /grey.*question mark.*coming soon/i);
  await expect(teaser.locator('.product-doodle')).toHaveText('?');
  await expect(teaser.locator('.product-art')).toHaveCSS('background-color', 'rgb(228, 228, 224)');
  await expect(teaser.getByText('Coming soon', { exact: true })).toBeVisible();
  await expect(teaser.getByText('Not available to order yet', { exact: true })).toBeVisible();
  await expect(teaser.locator('button, [data-add], .product-price, details')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText(/pistachio/i);
  await expect(page.locator('img[alt*="Pistachio"], img[src*="pistachio-my-love"]')).toHaveCount(0);
  await expect(page.locator('meta[name="description"]')).not.toHaveAttribute('content', /pistachio/i);
  await expect(page.locator('meta[property="og:description"]')).not.toHaveAttribute('content', /pistachio/i);
}

test('the grey mystery teaser stays unorderable even if an add control is tampered with', async ({ page }) => {
  await visitStorefront(page);
  await expectMysteryTeaser(page);
  // Exercise the actual event handler, not just the absence of an add button.
  const add = card(page, lemon).locator('[data-add]');
  await add.evaluate((button, id) => { (button as HTMLElement).dataset.add = id; }, mystery.id);
  await add.click();
  await expectCount(page, 0);
  await expect(page.locator('[data-toast]')).toContainText(/unavailable/i);
  await add.evaluate((button, id) => { (button as HTMLElement).dataset.add = id; }, lemon.id);
  await addCup(page, lemon);
  await openOrder(page);
  await expect(row(page, mystery)).toHaveCount(0);
  await expectMessage(page, [[lemon, 1]]);
  await expect(page.locator(`[data-add="${mystery.id}"]`)).toHaveCount(0);
});

test('native hero buttons support Enter and Space and update the image, pressed state and product highlight', async ({ page }) => {
  await visitStorefront(page);
  const picker = page.locator('.flavour-picker');
  const image = page.locator('[data-hero-image]');
  await expect(picker.getByRole('button')).toHaveCount(3);
  await expect(picker.locator(`[data-spotlight="${lemon.id}"]`)).toHaveAttribute('aria-pressed', 'true');
  await expect(image).toHaveAttribute('src', `/illustrations/${lemon.id}.svg`);

  for (const [flavour, key] of [[chocolate, 'Enter'], [mystery, 'Space'], [lemon, 'Enter']] as const) {
    const comingSoon = flavour.id === mystery.id;
    const button = picker.getByRole('button', { name: `Preview ${flavour.name}${comingSoon ? ' — coming soon' : ''}`, exact: true });
    await expect(button).toHaveJSProperty('tagName', 'BUTTON');
    await button.focus();
    await expect(button).toBeFocused();
    await page.keyboard.press(key);
    await expect(button).toBeFocused();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(picker.locator('[aria-pressed="true"]')).toHaveCount(1);
    await expect(picker.locator('[aria-pressed="false"]')).toHaveCount(2);
    await expect(image).toHaveAttribute('src', `/illustrations/${comingSoon ? 'mystery-cup' : flavour.id}.svg`);
    await expect(image).toHaveAttribute('alt', new RegExp(flavour.name));
    await expect.poll(() => image.evaluate((node) => {
      const img = node as HTMLImageElement;
      return img.complete && img.naturalWidth > 0;
    })).toBe(true);
    await expect(page.locator('[data-hero-name]')).toHaveText(comingSoon ? 'Mystery flavour · coming soon' : flavour.name);
    await expect(page.locator('[data-hero-theme]')).toHaveAttribute('data-hero-theme', flavour.theme);
    await expect(page.locator('[data-card][data-featured]')).toHaveCount(1);
    await expect(card(page, flavour)).toHaveAttribute('data-featured', '');
    await expect(card(page, flavour).locator('.product-art')).not.toHaveCSS('outline-style', 'none');
    if (comingSoon) {
      await expectMysteryTeaser(page);
      await expectCount(page, 0);
    }
  }
});

test('repeated adds produce one dialog row with quantity two and survive closing and reopening', async ({ page }) => {
  await visitStorefront(page);
  await addCup(page, lemon);
  await addCup(page, lemon);
  await expectCount(page, 2);
  await openOrder(page);
  await expect(drawer(page).locator('[data-line]')).toHaveCount(1);
  await expect(row(page, lemon).getByRole('heading', { name: lemon.name, exact: true })).toBeVisible();
  await expect(row(page, lemon).getByRole('spinbutton')).toHaveValue('2');
  await expectMessage(page, [[lemon, 2]]);
  await closeButton(page).click();
  await expect(drawer(page)).toBeHidden();
  await openOrder(page);
  await expect(drawer(page).locator('[data-line]')).toHaveCount(1);
  await expect(row(page, lemon).getByRole('spinbutton')).toHaveValue('2');
  await expectMessage(page, [[lemon, 2]]);
});

test('increment, decrement, removal and clear keep rows, counts and the draft message in sync', async ({ page }) => {
  await visitStorefront(page);
  for (const flavour of selectableMenu) await addCup(page, flavour);
  await openOrder(page);
  await expect(drawer(page).locator('[data-line]')).toHaveCount(2);
  await expectMessage(page, [[lemon, 1], [chocolate, 1]]);
  await expect(message(page)).toHaveValue(/prices?:[^\n]*confirm/i);
  await expect(message(page)).toHaveValue(/availability/i);
  await expect(message(page)).toHaveValue(/pickup\/delivery.*Melaka/i);
  await expect(message(page)).toHaveValue(/not a confirmed order/i);

  await row(page, lemon).getByRole('button', { name: `Increase ${lemon.name}`, exact: true }).click();
  await expect(row(page, lemon).getByRole('spinbutton')).toHaveValue('2');
  await expectCount(page, 3);
  await expectMessage(page, [[lemon, 2], [chocolate, 1]]);

  await row(page, lemon).getByRole('button', { name: `Decrease ${lemon.name}`, exact: true }).click();
  await expect(row(page, lemon).getByRole('spinbutton')).toHaveValue('1');
  await expectCount(page, 2);
  await expectMessage(page, [[lemon, 1], [chocolate, 1]]);

  await row(page, chocolate).getByRole('button', { name: `Remove ${chocolate.name}`, exact: true }).click();
  await expect(row(page, chocolate)).toHaveCount(0);
  await expectCount(page, 1);
  await expectMessage(page, [[lemon, 1]]);

  await row(page, lemon).getByRole('button', { name: `Decrease ${lemon.name}`, exact: true }).click();
  await expectEmptyOrder(page);
  await closeButton(page).click();
  await addCup(page, chocolate);
  await openOrder(page);
  await drawer(page).locator('[data-clear]').click();
  await expectEmptyOrder(page);
  await expect(drawer(page).locator('[data-drawer-status]')).toContainText(/clear/i);
  await expect(closeButton(page)).toBeFocused();
});

test('quantity input commits valid edits, reverts invalid edits and removes a row at zero', async ({ page }) => {
  await visitStorefront(page);
  await addCup(page, lemon);
  await openOrder(page);
  const quantity = row(page, lemon).getByRole('spinbutton', { name: `Quantity for ${lemon.name}`, exact: true });
  await quantity.fill('2');
  // Commit a genuine native change/blur rather than calling the application handler.
  await quantity.press('Tab');
  await expect(quantity).toHaveValue('2');
  await expectCount(page, 2);
  await expectMessage(page, [[lemon, 2]]);
  const originalMessage = await message(page).inputValue();

  for (const invalid of ['', '-1', '1.5', '100']) {
    await test.step(`reject ${invalid || 'empty input'}`, async () => {
      await quantity.fill(invalid);
      await quantity.press('Tab');
      await expect(quantity).toHaveValue('2');
      await expect(drawer(page).locator('[data-line]')).toHaveCount(1);
      await expect(drawer(page).locator('[data-drawer-status]')).toContainText(/whole number|quantity/i);
      await expectCount(page, 2);
      await expect(message(page)).toHaveValue(originalMessage);
    });
  }

  await quantity.fill('0');
  await quantity.press('Tab');
  await expect(row(page, lemon)).toHaveCount(0);
  await expectEmptyOrder(page);
  await expect(drawer(page).locator('[data-drawer-status]')).toContainText(/removed/i);
});

test('an initially empty dialog focuses its close button and restores the header opener on close and Escape', async ({ page }) => {
  await visitStorefront(page);
  await expectCount(page, 0);
  await expect(page.locator('[data-mobile-bag]')).toBeHidden();
  await expect(drawer(page)).toBeHidden();

  for (const action of ['close', 'Escape'] as const) {
    await openOrder(page);
    await expectEmptyOrder(page);
    await expect(closeButton(page)).toBeFocused();
    await expect(page.locator('body')).toHaveClass(/\bdialog-open\b/);
    if (action === 'close') await closeButton(page).click();
    else await page.keyboard.press('Escape');
    await expect(drawer(page)).toBeHidden();
    await expect(headerBag(page)).toBeFocused();
    await expect(page.locator('body')).not.toHaveClass(/\bdialog-open\b/);
  }
});

test('a nonempty dialog returns focus to its desktop or sticky mobile opener, with a fallback after clear', async ({ page, isMobile }) => {
  await visitStorefront(page);
  await addCup(page, chocolate);
  const opener = isMobile ? page.locator('[data-mobile-bag][data-open-order]') : headerBag(page);
  await expect(opener).toBeVisible();

  for (const action of ['close', 'Escape'] as const) {
    await opener.click();
    await expect(drawer(page)).toBeVisible();
    await expect(closeButton(page)).toBeFocused();
    await expectMessage(page, [[chocolate, 1]]);
    if (action === 'close') await closeButton(page).click();
    else await page.keyboard.press('Escape');
    await expect(drawer(page)).toBeHidden();
    await expect(opener).toBeFocused();
    await expect(page.locator('body')).not.toHaveClass(/\bdialog-open\b/);
  }

  await opener.click();
  await drawer(page).locator('[data-clear]').click();
  await expectEmptyOrder(page);
  await expect(page.locator('[data-mobile-bag]')).toBeHidden();
  await closeButton(page).click();
  await expect(drawer(page)).toBeHidden();
  await expect(headerBag(page)).toBeFocused();
});

test('clipboard rejection opens the preview and selects the entire fallback message without sending anything', async ({ page }) => {
  await page.addInitScript(() => {
    // Never touch the operating-system clipboard or request clipboard permissions.
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => { throw new DOMException('Clipboard denied by test', 'NotAllowedError'); },
      },
    });
  });
  await visitStorefront(page);
  await addCup(page, chocolate);
  await openOrder(page);
  await expectMessage(page, [[chocolate, 1]]);
  const preview = await message(page).inputValue();
  const details = drawer(page).locator('.message-details');
  await expect(details).toHaveJSProperty('open', true);
  await details.locator('summary').click();
  await expect(details).toHaveJSProperty('open', false);
  await drawer(page).locator('[data-copy]').click();

  await expect(details).toHaveJSProperty('open', true);
  await expect(message(page)).toBeVisible();
  await expect(message(page)).toBeFocused();
  await expect(message(page)).toHaveJSProperty('readOnly', true);
  await expect(message(page)).toHaveValue(preview);
  await expect.poll(() => message(page).evaluate((node) => {
    const textarea = node as HTMLTextAreaElement;
    return { start: textarea.selectionStart, end: textarea.selectionEnd };
  })).toEqual({ start: 0, end: preview.length });
  await expect(drawer(page).locator('[data-drawer-status]')).toContainText(/clipboard unavailable.*selected/i);
  await expectNoWhatsAppDestination(page);
  await expectCount(page, 1);
  await expect(page).toHaveURL('/');
  expect(page.context().pages()).toHaveLength(1);
});

test('reduced motion removes animations, transitions and smooth scrolling without disabling interactions', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await visitStorefront(page);
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
  await expect(page.locator('html')).toHaveCSS('scroll-behavior', 'auto');
  const spotlight = page.locator(`[data-spotlight="${lemon.id}"]`);
  await spotlight.focus();
  await page.keyboard.press('Space');
  await expect(spotlight).toHaveAttribute('aria-pressed', 'true');
  await expect(card(page, lemon)).toHaveAttribute('data-featured', '');
  await addCup(page, lemon);
  await openOrder(page);
  await expectMessage(page, [[lemon, 1]]);
  await settleVisuals(page);
  const movingElements = await page.locator(
    '[data-hero-image], .hero-orbit, [data-card] img, .button, [data-toast]',
  ).evaluateAll((nodes) => nodes.filter((node) => {
    const style = getComputedStyle(node);
    return style.animationName !== 'none' ||
      [...style.animationDuration.split(','), ...style.transitionDuration.split(',')]
        .some((duration) => Number.parseFloat(duration) !== 0);
  }).map((node) => node.outerHTML));
  expect(movingElements, 'Reduced-motion controls and artwork have no animated duration').toEqual([]);
});

// Separate cases keep each viewport isolated and avoid one long mobile-WebKit
// flow exhausting its timeout before the last width. Assertion limits stay intact.
for (const width of [360, 390, 768, 1440]) {
  test(`page and nonempty drawer have no horizontal overflow at ${width} pixels`, async ({ page }) => {
      await visitStorefront(page);
      await page.setViewportSize({ width, height: 900 });
      await settleVisuals(page);
      const expectPageFits = async () => {
        await expect.poll(() => page.evaluate(() =>
          Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - document.documentElement.clientWidth,
        ), `No document overflow at ${width}px`).toBeLessThanOrEqual(1);
      };
      await expectPageFits();
      for (const flavour of selectableMenu) await addCup(page, flavour);
      await page.locator(`[data-spotlight="${mystery.id}"]`).click();
      await settleVisuals(page);
      await expectPageFits();
      await openOrder(page);
      await expect(drawer(page).locator('[data-line]')).toHaveCount(2);
      await settleVisuals(page);
      await expectPageFits();
      for (const container of [drawer(page), drawer(page).locator('.drawer-scroll')]) {
        await expect.poll(() => container.evaluate((node) => node.scrollWidth - node.clientWidth),
          `No internal drawer overflow at ${width}px`).toBeLessThanOrEqual(1);
      }
      await drawer(page).locator('[data-clear]').click();
      await closeButton(page).click();
      await expect(drawer(page)).toBeHidden();
  });
}

test('axe finds no WCAG A/AA violations on the settled page and nonempty dialog', async ({ page }) => {
  test.setTimeout(60_000);
  const tags = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];
  await visitStorefront(page);
  await page.locator(`[data-spotlight="${mystery.id}"]`).click();
  await settleVisuals(page);
  const pageScan = await new AxeBuilder({ page }).withTags(tags).analyze();
  expect.soft(pageScan.violations, 'Full-page WCAG scan').toEqual([]);
  await card(page, lemon).locator('[data-flip-toggle]').click();
  await page.locator('.social-card summary').first().click();
  await settleVisuals(page);
  const revealedScan = await new AxeBuilder({ page }).withTags(tags).analyze();
  expect.soft(revealedScan.violations, 'Open flavour notes and social note WCAG scan').toEqual([]);
  const labelScan = await new AxeBuilder({ page }).withRules(['label-content-name-mismatch']).analyze();
  expect.soft(labelScan.violations, 'Accessible names include their visible labels').toEqual([]);

  for (const flavour of selectableMenu) await addCup(page, flavour);
  await openOrder(page);
  await expect(drawer(page).locator('[data-line]')).toHaveCount(2);
  await expect(drawer(page).locator('[data-order-summary]')).toBeVisible();
  await expectMessage(page, [[lemon, 1], [chocolate, 1]]);
  await settleVisuals(page);
  const dialogScan = await new AxeBuilder({ page }).include('#order-dialog').withTags(tags).analyze();
  expect.soft(dialogScan.violations, 'Nonempty dialog WCAG scan').toEqual([]);
});

test.describe('without site JavaScript', () => {
  // Retain each configured project's device, viewport and browser settings.
  test.use({ javaScriptEnabled: false });

  test('all three cards remain accessible, enhanced controls are absent and native FAQ expansion works', async ({ page }) => {
    test.setTimeout(60_000);
    await visitStorefront(page, false);
    await expect(page.locator('#flavours [data-card]')).toHaveCount(3);
    await expect(page.locator('#flavours [data-card] h3')).toHaveText(menu.map(({ name }) => name));
    for (const flavour of selectableMenu) {
      await expect(card(page, flavour).getByRole('heading', { name: flavour.name, exact: true })).toBeVisible();
      await expect(card(page, flavour).getByRole('img', { name: new RegExp(flavour.name) })).toBeVisible();
      const details = card(page, flavour).locator('.product-details');
      await details.locator('summary').click();
      await expect(details).toHaveJSProperty('open', true);
      await expect(details.locator(':scope > div')).toBeVisible();
    }
    await expectMysteryTeaser(page);
    // Native summary elements may expose button-like roles; they must remain usable.
    await expect(page.locator('button:visible')).toHaveCount(0);
    await expect(page.locator('[data-add]:visible, [data-open-order]:visible, [data-spotlight]:visible')).toHaveCount(0);
    await expect(drawer(page)).toBeHidden();
    await expect(page.locator('.noscript-note')).toContainText(/JavaScript/i);
    // The configured test contact now permits a plain enquiry without the builder.
    await expect(page.locator('.noscript-note').getByRole('link', { name: 'Enquire on WhatsApp' }))
      .toHaveAttribute('href', 'https://wa.me/60172688120');
    await expect(drawer(page).locator('[data-whatsapp][href]')).toHaveCount(0);

    const faq = page.locator('.faq-list details').first();
    await expect(faq).toHaveJSProperty('open', false);
    await expect(faq.locator('p')).toBeHidden();
    await faq.locator('summary').click();
    await expect(faq).toHaveJSProperty('open', true);
    await expect(faq.locator('p')).toBeVisible();
    await expect(faq.locator('p')).toContainText(/140\s*ml/i);
    await faq.locator('summary').click();
    await expect(faq).toHaveJSProperty('open', false);
    await expect(faq.locator('p')).toBeHidden();
    await expectSocialPlaceholders(page);
    const socialNote = page.locator('.social-card').first();
    await socialNote.locator('summary').click();
    await expect(socialNote.locator('.social-note')).toBeVisible();
    const backTop = page.getByRole('link', { name: 'Back to top', exact: true });
    await expect(backTop).toBeInViewport();
    await backTop.click();
    await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThanOrEqual(1);
  });
});