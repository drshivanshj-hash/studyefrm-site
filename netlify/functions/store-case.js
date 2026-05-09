// store-case.js
// Saves an approved teaching card to Netlify Blobs.
// Called from admin.html on "Approve & publish".
//
// ENV VARS REQUIRED:
//   ADMIN_TOKEN — same token used in process-case.js
//
// Netlify Blobs are available automatically in any Netlify Function.
// No extra packages needed — @netlify/blobs is built into the runtime.

const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const token = event.headers['x-admin-token'] || '';
  if (!token || token !== process.env.ADMIN_TOKEN) {
    return { statusCode: 401, body: 'Unauthorised' };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: 'Invalid JSON' }; }

  const { id, teachingCard, station, approvedAt } = body;
  if (!id || !teachingCard) {
    return { statusCode: 400, body: 'Missing id or teachingCard' };
  }

  try {
    const store = getStore('teaching-cards');

    // Store individual card by ID
    await store.setJSON(id, {
      id,
      station,
      approvedAt: approvedAt || new Date().toISOString(),
      teachingCard,
    });

    // Maintain an index of all approved card IDs
    let index = [];
    try {
      index = await store.get('_index', { type: 'json' }) || [];
    } catch { index = []; }

    if (!index.includes(id)) {
      index.unshift(id); // newest first
      await store.setJSON('_index', index);
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, id }),
    };
  } catch (err) {
    console.error('Blob store error:', err);
    return { statusCode: 502, body: 'Failed to store case' };
  }
};
