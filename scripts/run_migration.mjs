import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const supabase = createClient(
  'https://xvzdxoktwnzmxsfizkxo.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh2emR4b2t0d256bXhzZml6a3hvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4Mjk0MDUwOCwiZXhwIjoyMDk4NTE2NTA4fQ.bmUb58m-_4V5g0sqQzxyS-f0MnsElFycHU9PTXxByY4',
  { auth: { persistSession: false, autoRefreshToken: false } }
)

const sql = readFileSync(join(__dirname, '..', 'supabase', 'migrations', '20260707180000_mesclar_contas_telegram.sql'), 'utf8')

// Try direct SQL execution via REST API using the SQL endpoint
const resp = await fetch('https://xvzdxoktwnzmxsfizkxo.supabase.co/rest/v1/rpc/exec_sql', {
  method: 'POST',
  headers: {
    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh2emR4b2t0d256bXhzZml6a3hvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4Mjk0MDUwOCwiZXhwIjoyMDk4NTE2NTA4fQ.bmUb58m-_4V5g0sqQzxyS-f0MnsElFycHU9PTXxByY4',
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh2emR4b2t0d256bXhzZml6a3hvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4Mjk0MDUwOCwiZXhwIjoyMDk4NTE2NTA4fQ.bmUb58m-_4V5g0sqQzxyS-f0MnsElFycHU9PTXxByY4',
    'Content-Type': 'application/json',
    'Prefer': 'params=single-object'
  },
  body: JSON.stringify({})
})
console.log('Status:', resp.status)
const text = await resp.text()
console.log('Response:', text.substring(0, 500))
