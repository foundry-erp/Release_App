const { requireAuth } = require('../../middleware/auth');
const { supabase } = require('../../lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  await new Promise((resolve, reject) => {
    requireAuth(req, res, (err) => (err ? reject(err) : resolve()));
  }).catch(() => null);

  if (res.headersSent) return;

  const { moduleSlug, payload, photo } = req.body;

  if (!moduleSlug) {
    return res.status(400).json({ error: 'moduleSlug is required' });
  }
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ error: 'payload must be an object' });
  }

  // -- Photo upload (optional) ------------------------------------------
  let photo_url = null;

  if (photo) {
    try {
      // Strip data URL prefix: "data:image/jpeg;base64,..."
      const base64str = photo.replace(/^data:image\/[a-z]+;base64,/, '');
      const buffer = Buffer.from(base64str, 'base64');
      const storagePath = `${req.user.sub}/${Date.now()}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from('user-photos')
        .upload(storagePath, buffer, {
          contentType: 'image/jpeg',
          upsert: false,
        });

      if (uploadError) {
        console.error('Photo upload error (non-fatal):', uploadError.message);
        // photo_url stays null — report is still saved
      } else {
        const { data: urlData } = supabase.storage
          .from('user-photos')
          .getPublicUrl(storagePath);
        photo_url = urlData.publicUrl;
      }
    } catch (photoErr) {
      console.error('Photo processing error (non-fatal):', photoErr.message);
      // photo_url stays null — report is still saved
    }
  }
  // -----------------------------------------------------------------------

  const { data: report, error } = await supabase
    .from('reports')
    .insert({
      user_id: req.user.sub,
      module_slug: moduleSlug,
      payload: payload,
      photo_url: photo_url,
      status: 'submitted',
    })
    .select('id, photo_url, created_at')
    .single();

  if (error) {
    console.error('Supabase reports insert error:', error);
    return res.status(500).json({ error: 'Failed to save report' });
  }

  return res.status(201).json({
    id: report.id,
    photo_url: report.photo_url,
    created_at: report.created_at,
  });
};
