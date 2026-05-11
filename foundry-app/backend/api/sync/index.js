const { requireAuth } = require('../../middleware/auth');
const { supabase } = require('../../lib/supabase');

// Shared photo upload helper — used for both submit_report and any future
// action types that include an optional base64 photo.
async function uploadPhoto(userId, photo) {
  if (!photo) return null;
  try {
    const base64str = photo.replace(/^data:image\/[a-z]+;base64,/, '');
    const buffer = Buffer.from(base64str, 'base64');
    const storagePath = `${userId}/${Date.now()}.jpg`;

    const { error: uploadError } = await supabase.storage
      .from('user-photos')
      .upload(storagePath, buffer, {
        contentType: 'image/jpeg',
        upsert: false,
      });

    if (uploadError) {
      console.error('Sync photo upload error (non-fatal):', uploadError.message);
      return null;
    }

    const { data: urlData } = supabase.storage
      .from('user-photos')
      .getPublicUrl(storagePath);
    return urlData.publicUrl;
  } catch (err) {
    console.error('Sync photo processing error (non-fatal):', err.message);
    return null;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  await new Promise((resolve, reject) => {
    requireAuth(req, res, (err) => (err ? reject(err) : resolve()));
  }).catch(() => null);

  if (res.headersSent) return;

  const { actions } = req.body;

  if (!Array.isArray(actions)) {
    return res.status(400).json({ error: 'actions must be an array' });
  }
  if (actions.length > 50) {
    return res.status(400).json({ error: 'actions array exceeds maximum of 50 items' });
  }

  const userId = req.user.sub;
  const results = [];

  for (const action of actions) {
    const localId = action.local_id ?? null;

    // ---------------------------------------------------------------
    // Action: submit_report
    // ---------------------------------------------------------------
    if (action.type === 'submit_report') {
      try {
        const moduleSlug = action.payload?.moduleSlug;
        const VALID_MODULE_SLUGS = ['quality-inspector', 'inventory-checker'];
        if (!moduleSlug || !VALID_MODULE_SLUGS.includes(moduleSlug)) {
          results.push({
            local_id: localId,
            success: false,
            error: `Invalid or missing moduleSlug: ${moduleSlug}`,
          });
          continue;
        }
        const reportPayload = action.payload?.payload;
        const photo = action.payload?.photo;

        const photo_url = await uploadPhoto(userId, photo);

        const { data: report, error: reportError } = await supabase
          .from('reports')
          .insert({
            user_id: userId,
            module_slug: moduleSlug,
            payload: reportPayload ?? {},
            photo_url: photo_url,
            status: 'submitted',
          })
          .select('id')
          .single();

        if (reportError) throw reportError;

        // Log success
        await supabase.from('sync_logs').insert({
          user_id: userId,
          module_slug: moduleSlug,
          action_type: 'submit_report',
          local_id: localId,
          status: 'success',
        });

        results.push({ local_id: localId, success: true, server_id: report.id });
      } catch (err) {
        console.error('submit_report action failed:', err.message);

        await supabase.from('sync_logs').insert({
          user_id: userId,
          module_slug: action.payload?.moduleSlug ?? 'unknown',
          action_type: 'submit_report',
          local_id: localId,
          status: 'failed',
          error_message: err.message,
        });

        results.push({ local_id: localId, success: false, error: err.message });
      }

    // ---------------------------------------------------------------
    // Action: stock_count
    // ---------------------------------------------------------------
    } else if (action.type === 'stock_count') {
      try {
        const { data: report, error: reportError } = await supabase
          .from('reports')
          .insert({
            user_id: userId,
            module_slug: 'inventory-checker',
            payload: action.payload ?? {},
            photo_url: null,
            status: 'submitted',
          })
          .select('id')
          .single();

        if (reportError) throw reportError;

        // Log success
        await supabase.from('sync_logs').insert({
          user_id: userId,
          module_slug: 'inventory-checker',
          action_type: 'stock_count',
          local_id: localId,
          status: 'success',
        });

        results.push({ local_id: localId, success: true, server_id: report.id });
      } catch (err) {
        console.error('stock_count action failed:', err.message);

        await supabase.from('sync_logs').insert({
          user_id: userId,
          module_slug: 'inventory-checker',
          action_type: 'stock_count',
          local_id: localId,
          status: 'failed',
          error_message: err.message,
        });

        results.push({ local_id: localId, success: false, error: err.message });
      }

    // ---------------------------------------------------------------
    // Action: update_product_description
    // ---------------------------------------------------------------
    } else if (action.type === 'update_product_description') {
      try {
        const productId   = action.payload?.payload?.productId;
        const description = action.payload?.payload?.description;

        if (!productId || description === undefined || description === null) {
          results.push({
            local_id: localId,
            success: false,
            error: 'Missing productId or description in payload',
          });
          continue;
        }

        const { error: updateError } = await supabase
          .from('products')
          .update({ description })
          .eq('id', productId);

        if (updateError) throw updateError;

        await supabase.from('sync_logs').insert({
          user_id: userId,
          module_slug: 'quality-inspector',
          action_type: 'update_product_description',
          local_id: localId,
          status: 'success',
        });

        results.push({ local_id: localId, success: true });
      } catch (err) {
        console.error('update_product_description action failed:', err.message);

        await supabase.from('sync_logs').insert({
          user_id: userId,
          module_slug: 'quality-inspector',
          action_type: 'update_product_description',
          local_id: localId,
          status: 'failed',
          error_message: err.message,
        });

        results.push({ local_id: localId, success: false, error: err.message });
      }

    // ---------------------------------------------------------------
    // Unknown action type
    // ---------------------------------------------------------------
    } else {
      await supabase.from('sync_logs').insert({
        user_id: userId,
        module_slug: 'unknown',
        action_type: action.type ?? 'unknown',
        local_id: localId,
        status: 'failed',
        error_message: 'Unknown action type',
      });

      results.push({ local_id: localId, success: false, error: 'Unknown action type' });
    }
  }

  return res.status(200).json({ results });
};
