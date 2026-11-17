(() => {
  const cfg = window.EONIX_CONFIG || {};
  if (!window.supabase || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY ||
      cfg.SUPABASE_URL.includes("YOUR_") || cfg.SUPABASE_ANON_KEY.includes("YOUR_")) {
    window.sb = null;
    return;
  }
  window.sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
})();