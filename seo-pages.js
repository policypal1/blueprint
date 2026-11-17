export const SITE_NAME = 'EditFloorPlans.com';
export const SITE_ORIGIN = 'https://www.editfloorplans.com';

export const publicPages = {
  home: {
    path: '/',
    title: `Edit Floor Plan PDFs Online | ${SITE_NAME}`,
    description: 'Edit an existing floor plan PDF or image in your browser. Mark up walls, doors and fixtures, then export a revised PDF or PNG.',
    sitemap: true,
  },
  guide: {
    path: '/how-to-edit-a-floor-plan-pdf',
    title: `How to Edit a Floor Plan PDF | ${SITE_NAME}`,
    description: 'Watch a floor plan markup example and learn how to upload a PDF, mark up layout changes, check the scale and export a revised drawing.',
    sitemap: true,
  },
  guides: {
    path: '/floor-plan-guides',
    title: `Floor Plan Editing Guides | ${SITE_NAME}`,
    description: 'Learn to measure an existing floor plan, mark up a remodel, and print a revised floor plan PDF to scale.',
    sitemap: true,
  },
  measureGuide: {
    path: '/measure-a-floor-plan-pdf',
    heading: 'How to measure a floor plan PDF',
    title: `How to Measure a Floor Plan PDF | ${SITE_NAME}`,
    description: 'Set an accurate scale from a known dimension, measure your PDF floor plan, and place a dimension label on the exported drawing.',
    article: true,
    sitemap: true,
  },
  remodelGuide: {
    path: '/mark-up-a-floor-plan-for-a-remodel',
    heading: 'How to mark up a floor plan for a remodel',
    title: `How to Mark Up a Floor Plan for a Remodel | ${SITE_NAME}`,
    description: 'Mark proposed wall, doorway, and fixture changes on a copy of your existing floor plan and share the revision for review.',
    article: true,
    sitemap: true,
  },
  printGuide: {
    path: '/print-a-floor-plan-pdf-to-scale',
    heading: 'How to print a floor plan PDF to scale',
    title: `How to Print a Floor Plan PDF to Scale | ${SITE_NAME}`,
    description: 'Export a floor plan at a fixed drawing scale, choose the right paper size, and verify that your printed PDF measures correctly.',
    article: true,
    sitemap: true,
  },
  pricing: {
    path: '/pricing',
    title: `Floor Plan Editor Pricing | ${SITE_NAME}`,
    description: 'Compare a single $10 USD blueprint project credit with the $19 USD monthly floor plan editor. See how credits, exports and renewals work.',
    sitemap: true,
  },
  signIn: {
    path: '/sign-in',
    title: `Sign in | ${SITE_NAME}`,
    description: 'Sign in or create an account to edit and export your floor plans.',
    noindex: true,
  },
  notFound: {
    path: '/404',
    title: `Page not found | ${SITE_NAME}`,
    description: 'Find your way back to EditFloorPlans.com or open your workspace.',
    noindex: true,
  },
  terms: {
    path: '/terms',
    title: `Terms of Service | ${SITE_NAME}`,
    description: 'Read the terms for using the floor plan editor, trying the service and purchasing project or monthly access.',
  },
  privacy: {
    path: '/privacy',
    title: `Privacy Policy | ${SITE_NAME}`,
    description: 'Learn how account data, drawings, payments and free-trial eligibility are handled.',
  },
  'refunds-and-cancellation': {
    path: '/refunds-and-cancellation',
    title: `Refunds and Cancellation | ${SITE_NAME}`,
    description: 'See how billing, refunds, subscription cancellation and access after cancellation work.',
  },
  support: {
    path: '/support',
    title: `Contact Support | ${SITE_NAME}`,
    description: 'Get help with floor plan editing, your account, billing and privacy requests.',
  },
};

export function publicPageAt(pathname) {
  const path = pathname.replace(/\/+$/, '').replace(/\.html$/, '') || '/';
  return Object.keys(publicPages).find((page) => publicPages[page].path === path);
}
