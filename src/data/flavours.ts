import type { Flavour } from '../lib/types';

// Prices use integer minor units (e.g. 1250 means 12.50 for MYR), never floating point.
// null means unknown, NOT free. Keep unverified dietary claims out of the menu.
const assetPath = (fileName: string) => `${import.meta.env.BASE_URL.replace(/\/$/, '')}/illustrations/${fileName}`;

export const flavours: Flavour[] = [
  {
    id: 'lemon-almond-nibs',
    name: 'Lemon Almond Nibs',
    shortName: 'Lemon',
    theme: 'lemon',
    illustration: assetPath('lemon-almond-nibs.svg'),
    volumeMl: 140,
    volumeApproximate: true,
    priceMinor: 1190,
    availability: 'unconfirmed',
    details: 'Bright lemon gelato with creamy dairy richness, fragrant zest and caramelized almond nibs for a crisp little crunch.',
    ingredients: ['Fresh milk', 'Heavy cream', 'Glucose syrup', 'Icing sugar', 'Egg yolks', 'Milk powder', 'Lemon juice', 'Lemon zest', 'Caramelized almond nibs', 'Xanthan gum', 'Salt'],
    allergens: 'Contains milk, egg and almond.',
    contentReviewed: false,
  },
  {
    id: 'dark-chocolate',
    name: 'Dark Chocolate',
    shortName: 'Chocolate',
    theme: 'cocoa',
    illustration: assetPath('dark-chocolate.svg'),
    volumeMl: 140,
    volumeApproximate: true,
    priceMinor: 1290,
    availability: 'unconfirmed',
    details: 'Deep, velvety chocolate gelato made with 72% dark chocolate and balanced by creamy dairy richness.',
    ingredients: ['Fresh milk', 'Heavy cream', 'Glucose syrup', 'Icing sugar', 'Egg yolks', 'Milk powder', '72% dark chocolate', 'Xanthan gum', 'Salt'],
    allergens: 'Contains milk and egg. Dark chocolate may contain other allergens; please check with us before ordering if you have a food allergy.',
    contentReviewed: false,
  },
  {
    id: 'pistachio-my-love',
    name: 'Pistachio My Love',
    shortName: 'Pistachio',
    theme: 'pistachio',
    illustration: assetPath('pistachio-my-love.svg'),
    volumeMl: 140,
    volumeApproximate: true,
    priceMinor: null,
    // Keep the real name and artwork here for the reveal. Coming-soon flavours
    // use a generic mystery presentation and cannot be selected for an order.
    availability: 'coming-soon',
    details: 'Not prepared or released yet. Product details will be reviewed before the reveal.',
    ingredients: null,
    allergens: null,
    contentReviewed: false,
  },
];