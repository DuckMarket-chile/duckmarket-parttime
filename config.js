// Conexión con la base de Supabase de Part-Time.
// La "clave pública" (publishable / anon) PUEDE ir aquí: es pública por diseño; lo que protege los datos son los
// permisos de la base (Row Level Security). NUNCA pegar aquí la clave "service_role" ni "secret".
// Supabase → Project Settings → API Keys.
window.CONFIG_PARTTIME = {
  url: 'https://dnaqxvpwubjaltaxkrpa.supabase.co',            // ej. https://abcdefghijkl.supabase.co
  clave: 'sb_publishable_DEBHKYFt1PwYvoy-OYxbsA_YBCW9nUI', // ej. sb_publishable_…  o  eyJ… (anon)
  dominio: 'parttime.duckmarket.cl'    // usuario "andes" entra como andes@parttime.duckmarket.cl
};
