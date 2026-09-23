import { describe, expect, it } from 'vitest';
import { business } from '../src/data/business';
import { flavours } from '../src/data/flavours';
import { calculateSubtotal, formatPrice, orderLines, setQuantity, volumeLabel } from '../src/lib/order';
import type { BusinessConfig, Flavour, OrderSelection } from '../src/lib/types';
import { validateBusinessConfig, validateFlavours } from '../src/lib/validation';

const lemonId = 'lemon-almond-nibs';
const chocolateId = 'dark-chocolate';
const pistachioId = 'pistachio-my-love';

// Reserved fictional NANP number: fixture data only, never contacted.
const liveBusiness: BusinessConfig = {
  ...business,
  mode: 'live',
  currency: 'MYR',
  whatsappNumber: '12025550100',
  siteUrl: 'https://nibby.example',
  fulfilment: 'Test fixture: pickup arrangements confirmed with the owner.',
  contactVerified: true,
  launchReviewed: true,
};

function reviewedMenu(): Flavour[] {
  return flavours.map((flavour) => ({
    ...flavour,
    priceMinor: 1250,
    volumeMl: 140,
    volumeApproximate: false,
    details: 'Reviewed product description for testing only.',
    allergens: 'Test fixture only: contains milk and nuts.',
    contentReviewed: true,
    availability: 'available',
  }));
}

function withLemon(patch: Partial<Flavour>, menu: readonly Flavour[] = flavours): Flavour[] {
  return menu.map((flavour) => ({ ...flavour, ...(flavour.id === lemonId ? patch : {}) }));
}

const invalidQuantities = [-1, -0.5, 1.5, NaN, Infinity, -Infinity, 100, Number.MAX_SAFE_INTEGER + 1];

describe('initial data and flavour validation', () => {
  it('contains exactly the three agreed flavour names', () => {
    expect(flavours.map(({ name }) => name).sort()).toEqual([
      'Dark Chocolate',
      'Lemon Almond Nibs',
      'Pistachio My Love',
    ]);
  });

  it('lists xanthan gum for both revealed flavours but not the unreleased teaser', () => {
    for (const flavour of flavours) {
      if (flavour.availability === 'coming-soon') {
        expect(flavour.ingredients).toBeNull();
      } else {
        expect(flavour.ingredients).toContain('Xanthan gum');
        expect(flavour.ingredients).not.toContain('Gelatin');
      }
    }
  });

  it('accepts the draft with configured prices and unreviewed content', () => {
    expect(business).toMatchObject({
      mode: 'draft',
      currency: 'MYR',
      whatsappNumber: '60172688120',
      siteUrl: null,
      fulfilment: null,
      contactVerified: false,
      launchReviewed: false,
    });
    for (const flavour of flavours) {
      expect(flavour).toMatchObject({
        priceMinor: flavour.id === lemonId ? 1190 : flavour.id === chocolateId ? 1290 : null,
        volumeMl: 140,
        volumeApproximate: true,
        availability: flavour.id === pistachioId ? 'coming-soon' : 'unconfirmed',
        ingredients: flavour.id === pistachioId ? null : expect.any(Array),
        allergens: flavour.id === pistachioId ? null : expect.any(String),
        contentReviewed: false,
      });
    }
    expect(() => validateFlavours(flavours)).not.toThrow();
    expect(() => validateBusinessConfig(business, flavours)).not.toThrow();
  });

  it('rejects an empty menu', () => {
    expect(() => validateFlavours([])).toThrow();
  });

  it('rejects an unsupported runtime availability value', () => {
    expect(() => validateFlavours(withLemon({ availability: 'typo' as Flavour['availability'] }))).toThrow(/availability/);
  });

  it('rejects duplicate IDs even when the products have different names', () => {
    expect(() => validateFlavours(withLemon({ id: chocolateId }))).toThrow();
  });

  it.each(['', 'Lemon', 'lemon almond', 'lemon_almond', '-lemon', 'lemon-', 'lemon--almond', 'café', 'lemon\n'])(
    'rejects invalid ID %j',
    (id) => {
      expect(() => validateFlavours(withLemon({ id }))).toThrow();
    },
  );

  it.each(['', ' \t\n'])('rejects a blank flavour name %j', (name) => {
    expect(() => validateFlavours(withLemon({ name }))).toThrow();
  });

  it.each([-1, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid minor-unit price %s',
    (priceMinor) => {
      expect(() => validateFlavours(withLemon({ priceMinor }))).toThrow();
    },
  );

  it.each([null, 0, 1250, Number.MAX_SAFE_INTEGER])('accepts valid price %s', (priceMinor) => {
    expect(() => validateFlavours(withLemon({ priceMinor }))).not.toThrow();
  });

  it.each([0, -1, 140.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid volume %s',
    (volumeMl) => {
      expect(() => validateFlavours(withLemon({ volumeMl }))).toThrow();
    },
  );
});

describe('business configuration validation', () => {
  it('accepts a fully reviewed live fixture', () => {
    expect(() => validateBusinessConfig(liveBusiness, reviewedMenu())).not.toThrow();
  });

  it('does not turn the initial draft into a live store by changing mode alone', () => {
    expect(() => validateBusinessConfig({ ...business, mode: 'live' }, flavours)).toThrow();
  });

  const missingLaunchFields: Array<{ label: string; patch: Partial<BusinessConfig> }> = [
    { label: 'WhatsApp number', patch: { whatsappNumber: null } },
    { label: 'currency', patch: { currency: null } },
    { label: 'site URL', patch: { siteUrl: null } },
    { label: 'fulfilment', patch: { fulfilment: null } },
    { label: 'empty fulfilment', patch: { fulfilment: '' } },
    { label: 'whitespace fulfilment', patch: { fulfilment: ' \t\n' } },
    { label: 'contact verification', patch: { contactVerified: false } },
    { label: 'launch review', patch: { launchReviewed: false } },
  ];

  it.each(missingLaunchFields)('blocks live launch without $label', ({ patch }) => {
    expect(() => validateBusinessConfig({ ...liveBusiness, ...patch }, reviewedMenu())).toThrow();
  });

  const invalidProvidedFields: Array<{ label: string; patch: Partial<BusinessConfig> }> = [
    { label: 'empty contact', patch: { whatsappNumber: '' } },
    { label: 'non-digit contact', patch: { whatsappNumber: '+12025550100' } },
    { label: 'local leading zero', patch: { whatsappNumber: '02025550100' } },
    { label: 'empty currency', patch: { currency: '' } },
    { label: 'lowercase currency', patch: { currency: 'myr' } },
    { label: 'short currency', patch: { currency: 'MY' } },
    { label: 'long currency', patch: { currency: 'MYRR' } },
    { label: 'currency with trailing newline', patch: { currency: 'MYR\n' } },
    { label: 'empty URL', patch: { siteUrl: '' } },
    { label: 'malformed URL', patch: { siteUrl: 'not a URL' } },
    { label: 'HTTP URL', patch: { siteUrl: 'http://nibby.example' } },
    { label: 'FTP URL', patch: { siteUrl: 'ftp://nibby.example' } },
    { label: 'URL username', patch: { siteUrl: 'https://test-user@nibby.example' } },
    { label: 'URL password', patch: { siteUrl: 'https://:test-only@nibby.example' } },
    { label: 'URL query', patch: { siteUrl: 'https://nibby.example?preview=1' } },
    { label: 'URL fragment', patch: { siteUrl: 'https://nibby.example#preview' } },
  ];

  describe.each(['draft', 'live'] as const)('%s supplied values', (mode) => {
    it.each(invalidProvidedFields)('rejects $label', ({ patch }) => {
      expect(() => validateBusinessConfig({ ...liveBusiness, mode, ...patch }, reviewedMenu())).toThrow();
    });
  });

  const unreviewedFlavourFields: Array<{ label: string; patch: Partial<Flavour> }> = [
    { label: 'unknown price', patch: { priceMinor: null } },
    { label: 'unreviewed content', patch: { contentReviewed: false } },
    { label: 'approximate volume', patch: { volumeApproximate: true } },
    { label: 'missing allergens', patch: { allergens: null } },
    { label: 'empty allergens', patch: { allergens: '' } },
    { label: 'whitespace allergens', patch: { allergens: ' \t\n' } },
    { label: 'unconfirmed availability', patch: { availability: 'unconfirmed' } },
  ];

  describe.each(flavours)('live review of $name', ({ id }) => {
    it.each(unreviewedFlavourFields)('blocks $label on this product alone', ({ patch }) => {
      const menu = reviewedMenu().map((flavour) => ({ ...flavour, ...(flavour.id === id ? patch : {}) }));
      expect(() => validateBusinessConfig(liveBusiness, menu)).toThrow();
    });
  });

  it('accepts explicitly reviewed zero prices and a confirmed sold-out status', () => {
    const menu = withLemon({ priceMinor: 0, availability: 'sold-out' }, reviewedMenu());
    expect(() => validateBusinessConfig(liveBusiness, menu)).not.toThrow();
  });

  it('allows an unorderable teaser alongside reviewed live products, but still requires review on reveal', () => {
    const teaser = flavours.find(({ id }) => id === pistachioId)!;
    const menu = reviewedMenu().map((flavour) => flavour.id === pistachioId ? teaser : flavour);
    expect(() => validateBusinessConfig(liveBusiness, menu)).not.toThrow();
    for (const availability of ['unconfirmed', 'available', 'sold-out'] as const) {
      const revealed = menu.map((flavour) => flavour.id === pistachioId ? { ...teaser, availability } : flavour);
      expect(() => validateBusinessConfig(liveBusiness, revealed)).toThrow(/revealed flavour/);
    }
    expect(() => validateBusinessConfig({ ...liveBusiness, contactVerified: false }, menu)).toThrow();
  });

  it('also applies basic flavour validation to live data', () => {
    expect(() => validateBusinessConfig(liveBusiness, [])).toThrow();
    expect(() => validateBusinessConfig(liveBusiness, withLemon({ priceMinor: -1 }, reviewedMenu()))).toThrow();
    expect(() => validateBusinessConfig(liveBusiness, withLemon({ volumeMl: 0 }, reviewedMenu()))).toThrow();
  });
});

describe('order selection', () => {
  it.each([1, 99])('accepts quantity %i without mutating the selection or menu', (quantity) => {
    const selection = Object.freeze({ [lemonId]: 2, [chocolateId]: 3 });
    const menu = Object.freeze(flavours.map((flavour) => Object.freeze({ ...flavour })));
    const next = setQuantity(selection, menu, lemonId, quantity);

    expect(next).toEqual({ [lemonId]: quantity, [chocolateId]: 3 });
    expect(next).not.toBe(selection);
    expect(selection).toEqual({ [lemonId]: 2, [chocolateId]: 3 });
    expect(menu).toEqual(flavours);
  });

  it('adds a new flavour without dropping the other line', () => {
    const selection = Object.freeze({ [chocolateId]: 3 });
    expect(setQuantity(selection, flavours, lemonId, 1)).toEqual({ [chocolateId]: 3, [lemonId]: 1 });
    expect(selection).toEqual({ [chocolateId]: 3 });
  });

  it('uses zero to remove a line rather than storing a zero quantity', () => {
    const selection = Object.freeze({ [lemonId]: 2, [chocolateId]: 3 });
    const next = setQuantity(selection, flavours, lemonId, 0);
    expect(next).toEqual({ [chocolateId]: 3 });
    expect(next).not.toHaveProperty(lemonId);
    expect(selection).toEqual({ [lemonId]: 2, [chocolateId]: 3 });
    expect(setQuantity(next, flavours, chocolateId, 0)).toEqual({});
  });

  it('allows removing a known flavour which is not currently selected', () => {
    expect(setQuantity({}, flavours, lemonId, 0)).toEqual({});
  });

  it.each(invalidQuantities)('rejects invalid quantity %s without changing the order', (quantity) => {
    const selection = Object.freeze({ [lemonId]: 2 });
    expect(() => setQuantity(selection, flavours, lemonId, quantity)).toThrow();
    expect(selection).toEqual({ [lemonId]: 2 });
  });

  it.each([0, 1, 99])('blocks unknown, sold-out and coming-soon targets even for quantity %i', (quantity) => {
    expect(() => setQuantity({}, flavours, 'not-on-menu', quantity)).toThrow();
    expect(() => setQuantity({}, withLemon({ availability: 'sold-out' }), lemonId, quantity)).toThrow();
    expect(() => setQuantity({}, flavours, pistachioId, quantity)).toThrow(/unavailable/i);
  });

  it('returns every selected flavour and quantity, including the upper boundary', () => {
    const menu = reviewedMenu(); // Explicitly released fixture, not the upcoming real menu.
    const selection: OrderSelection = Object.freeze({ [lemonId]: 1, [chocolateId]: 99, [pistachioId]: 4 });
    const lines = orderLines(selection, menu);
    expect(lines).toHaveLength(3);
    expect(lines).toEqual(expect.arrayContaining(menu.map((flavour) => ({
      flavour,
      quantity: selection[flavour.id],
    }))));
    expect(orderLines({}, flavours)).toEqual([]);
  });

  it.each([0, ...invalidQuantities])('rejects raw selection quantity %s before reading or updating', (quantity) => {
    const selection = { [lemonId]: quantity };
    expect(() => orderLines(selection, flavours)).toThrow();
    expect(() => setQuantity(selection, flavours, chocolateId, 1)).toThrow();
  });

  it('rejects unavailable existing lines rather than silently dropping them', () => {
    const soldOutMenu = withLemon({ availability: 'sold-out' });
    expect(() => orderLines({ 'not-on-menu': 1 }, flavours)).toThrow();
    expect(() => orderLines({ [lemonId]: 1 }, soldOutMenu)).toThrow();
    expect(() => setQuantity({ 'not-on-menu': 1 }, flavours, chocolateId, 1)).toThrow();
    expect(() => setQuantity({ [lemonId]: 1 }, soldOutMenu, chocolateId, 1)).toThrow();
    expect(() => orderLines({ [pistachioId]: 1 }, flavours)).toThrow(/unavailable/i);
    expect(() => setQuantity({ [pistachioId]: 1 }, flavours, chocolateId, 1)).toThrow(/unavailable/i);
  });
});

describe('subtotal', () => {
  it('adds each selected price times its quantity in integer minor units', () => {
    const menu = withLemon({ priceMinor: 1234 }, reviewedMenu().map((flavour) => ({ ...flavour, priceMinor: 1567 })));
    expect(calculateSubtotal({ [lemonId]: 2, [chocolateId]: 3 }, menu, 'MYR')).toBe(7169);
  });

  it('returns null for an empty order or wholly unknown prices', () => {
    expect(calculateSubtotal({}, reviewedMenu(), 'MYR')).toBeNull();
    expect(calculateSubtotal({ [lemonId]: 1, [chocolateId]: 2 }, flavours, null)).toBeNull();
  });

  it.each([lemonId, chocolateId, pistachioId])('returns null when only the selected %s price is unknown', (id) => {
    const menu = reviewedMenu().map((flavour) => ({ ...flavour, priceMinor: flavour.id === id ? null : 1250 }));
    expect(calculateSubtotal({ [lemonId]: 1, [chocolateId]: 2, [pistachioId]: 3 }, menu, 'MYR')).toBeNull();
  });

  it('ignores unknown prices on unselected flavours', () => {
    expect(calculateSubtotal({ [lemonId]: 2 }, withLemon({ priceMinor: 1250 }), 'MYR')).toBe(2500);
  });

  it.each([null, ''])('returns null when currency is missing (%j)', (currency) => {
    expect(calculateSubtotal({ [lemonId]: 2 }, reviewedMenu(), currency)).toBeNull();
  });

  it('treats an explicit zero price as known, not missing', () => {
    const menu = withLemon({ priceMinor: 0 }, reviewedMenu());
    expect(calculateSubtotal({ [lemonId]: 99 }, menu, 'MYR')).toBe(0);
    expect(calculateSubtotal({ [lemonId]: 99, [chocolateId]: 2 }, menu, 'MYR')).toBe(2500);
    expect(calculateSubtotal({ [lemonId]: 99 }, menu, null)).toBeNull();
  });

  it('accepts an exactly safe total but rejects multiplication overflow', () => {
    const menu = withLemon({ priceMinor: Number.MAX_SAFE_INTEGER }, reviewedMenu());
    expect(calculateSubtotal({ [lemonId]: 1 }, menu, 'MYR')).toBe(Number.MAX_SAFE_INTEGER);
    expect(() => calculateSubtotal({ [lemonId]: 2 }, menu, 'MYR')).toThrow();
  });

  it('rejects addition overflow even if both line totals are individually safe', () => {
    const menu = withLemon({ priceMinor: Number.MAX_SAFE_INTEGER }, reviewedMenu().map((flavour) => ({ ...flavour, priceMinor: 1 })));
    expect(() => calculateSubtotal({ [lemonId]: 1, [chocolateId]: 1 }, menu, 'MYR')).toThrow();
  });

  it.each(['MYR', null])('still rejects invalid selections with currency %s', (currency) => {
    expect(() => calculateSubtotal({ 'not-on-menu': 1 }, flavours, currency)).toThrow();
    expect(() => calculateSubtotal({ [lemonId]: 0 }, flavours, currency)).toThrow();
    expect(() => calculateSubtotal({ [lemonId]: 1 }, withLemon({ availability: 'sold-out' }), currency)).toThrow();
    expect(() => calculateSubtotal({ [pistachioId]: 1 }, flavours, currency)).toThrow(/unavailable/i);
  });
});

describe('price and volume labels', () => {
  it.each([
    { currency: 'MYR', minor: 1234, major: 12.34 },
    { currency: 'USD', minor: 1234, major: 12.34 },
    { currency: 'JPY', minor: 1234, major: 1234 },
    { currency: 'KWD', minor: 1234, major: 1.234 },
  ])('formats $currency using its own minor-unit precision', ({ currency, minor, major }) => {
    // Native formatting avoids depending on locale-specific spaces or symbol placement.
    const expected = new Intl.NumberFormat('en-MY', { style: 'currency', currency }).format(major);
    expect(formatPrice(minor, currency)).toBe(expected);
  });

  it('formats zero as a currency amount rather than a pending price', () => {
    expect(formatPrice(0, 'MYR')).toBe(new Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR' }).format(0));
    expect(formatPrice(0, 'MYR')).not.toBe(formatPrice(null, 'MYR'));
  });

  it.each([
    { minor: null, currency: 'MYR' },
    { minor: 1250, currency: null },
    { minor: 0, currency: null },
    { minor: null, currency: null },
  ])('shows a pending label for $minor with currency $currency', ({ minor, currency }) => {
    expect(formatPrice(minor, currency)).toMatch(/price.*coming soon/i);
  });

  it('marks draft cup sizes as approximate and removes the qualifier after review', () => {
    for (const flavour of flavours) {
      expect(volumeLabel(flavour)).toMatch(/approx\.?/i);
      expect(volumeLabel(flavour)).toContain('140 ml');
      const confirmed = volumeLabel({ ...flavour, volumeMl: 150, volumeApproximate: false });
      expect(confirmed).toContain('150 ml');
      expect(confirmed).not.toMatch(/approx/i);
    }
  });
});