const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

function loadEnv(path) {
  const txt = fs.readFileSync(path, 'utf8');
  for (const rawLine of txt.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

async function main() {
  loadEnv('.env.local');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('Missing Supabase env vars');
  }

  const supabase = createClient(url, key);

  const { data: byJobAddress, error: byJobAddressErr } = await supabase
    .from('jobs')
    .select('id,title,status,ops_status,field_complete,on_the_way_at,scheduled_date,window_start,window_end,contractor_id,city,job_address,deleted_at,created_at')
    .or('job_address.ilike.%Euclid%,city.ilike.%Stockton%')
    .order('created_at', { ascending: false })
    .limit(50);

  if (byJobAddressErr) throw byJobAddressErr;

  const { data: locations, error: locErr } = await supabase
    .from('locations')
    .select('id,address_line1,city,state,zip')
    .or('address_line1.ilike.%Euclid%,city.ilike.%Stockton%')
    .limit(100);

  if (locErr) throw locErr;

  const locationIds = (locations ?? []).map((l) => l.id).filter(Boolean);

  let byLocation = [];
  if (locationIds.length) {
    const { data: jobsByLocation, error: jobsByLocErr } = await supabase
      .from('jobs')
      .select('id,title,status,ops_status,field_complete,on_the_way_at,scheduled_date,window_start,window_end,contractor_id,city,job_address,location_id,deleted_at,created_at')
      .in('location_id', locationIds)
      .order('created_at', { ascending: false })
      .limit(100);
    if (jobsByLocErr) throw jobsByLocErr;
    byLocation = jobsByLocation ?? [];
  }

  console.log('--- jobs by job_address/city ---');
  console.log(JSON.stringify(byJobAddress, null, 2));
  console.log('--- matching locations ---');
  console.log(JSON.stringify(locations, null, 2));
  console.log('--- jobs by matching location_id ---');
  console.log(JSON.stringify(byLocation, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
