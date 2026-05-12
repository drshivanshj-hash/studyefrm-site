// get-cases.js
// Returns all approved teaching cards from Netlify Blobs.
// Called by index.html on page load to populate the Cases section.
// Public endpoint — no auth required (teaching cards are already anonymised).

const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const store = getStore('teaching-cards', {
  siteID: process.env.NETLIFY_SITE_ID,
  token: process.env.NETLIFY_AUTH_TOKEN
});

    // Get ordered index
    let index = [];
    try {
      index = await store.get('_index', { type: 'json' }) || [];
    } catch { index = []; }

    if (!index.length) {
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache',
        },
        body: JSON.stringify([]),
      };
    }

    // Fetch all cards in parallel
    const cards = await Promise.all(
      index.map(async (id) => {
        try {
          return await store.get(id, { type: 'json' });
        } catch { return null; }
      })
    );

    const valid = cards.filter(Boolean);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
      },
      body: JSON.stringify(valid),
    };
  } catch (err) {
    console.error('Blob fetch error:', err);
    return {
      statusCode: 502,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify([]),
    };
  }
};
