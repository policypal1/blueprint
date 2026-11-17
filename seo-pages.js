export const SITE_NAME = 'EditFloorPlans.com';
export const TEST_SITE_ORIGIN = 'https://blueprint-blue-theta.vercel.app';

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
