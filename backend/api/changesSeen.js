import { createClient } from "@supabase/supabase-js";

function enableCors(req, res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "*");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key);
}

export default async function handler(req, res) {
  enableCors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { fam, viewerDeviceId, seenAt } = req.body || {};
    if (!fam || !viewerDeviceId) return res.status(400).json({ error: "Missing fam/viewerDeviceId" });

    const supabase = getSupabase();
    const ts = seenAt || new Date().toISOString();

    const { error } = await supabase.from("change_seen").upsert({
      fam,
      viewer_device_id: viewerDeviceId,
      last_seen_at: ts
    });
    if (error) throw error;

    res.status(200).json({ ok: true, last_seen_at: ts });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}
