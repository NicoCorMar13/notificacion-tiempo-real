import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const fam = req.query.fam;
    if (!fam) return res.status(400).json({ error: "Missing fam" });

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    const { data, error } = await supabase
      .from("planning")
      .select("data, updated_at")
      .eq("fam", fam)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      const { error: insErr } = await supabase.from("planning").insert({ fam, data: {} });
      if (insErr) throw insErr;
      return res.status(200).json({ data: {}, updatedAt: null });
    }

    return res.status(200).json({ data: data.data || {}, updatedAt: data.updated_at });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
