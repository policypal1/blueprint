export const PRODUCT_CONFIG = {
  name: 'Blueprint Studio',
  tagline: 'Update the plan. Keep the job moving.',
  description: 'A focused blueprint revision workspace for remodelers, contractors, estimators, and field teams.',
  pricing: {
    regularMonthly: 49,
    launchMonthly: 48,
  },
  testBypassCode: '1234',
  storagePrefix: 'blueprint-launch-v2',
};

export const FREE_TOOLS = [
  'Upload blueprint',
  'Wall tool',
  'Window tool',
  'Door tools',
  'Brush erase',
  'Clean area',
];

export const PRO_FEATURES = [
  'Everything in the free workspace',
  'Lines, rectangles, and text labels',
  'All fixtures and plan objects',
  'PDF and high-resolution PNG export',
  'Full revision toolkit for client-ready plans',
];

export const FAQS = [
  ['Can I use Blueprint Studio before paying?', 'Yes. Create a free account and you can immediately upload a plan and use the starter revision tools: walls, windows, doors, brush erase, and clean area.'],
  ['What does Pro unlock?', 'Pro unlocks the rest of the editor, including annotation tools, fixtures and plan objects, plus PDF and high-resolution PNG export.'],
  ['What files can I upload?', 'The editor accepts PNG, JPG, WebP, and PDF files. PDF import uses the first page as the blueprint background.'],
  ['Do I need CAD experience?', 'No. Blueprint Studio is designed around direct editing instead of a traditional CAD workflow. Upload the plan, make the revision, and export.'],
  ['Can I use real measurements?', 'Use Text to place a known measurement on the drawing. Type the value and its unit, such as 36 in.'],
  ['Where are projects saved right now?', 'In this frontend build, projects are stored locally in the current browser. Your backend can later replace that storage layer with cloud project sync.'],
  ['Is there a free trial?', 'No. The free account is the trial experience. Users can keep using the starter tools without entering a card, then upgrade to Pro when they need the full toolkit.'],
  ['Can I cancel Pro?', 'Yes. The intended production model is month-to-month billing with cancellation at any time. The final billing behavior will be controlled by the payment backend you connect.'],
];
