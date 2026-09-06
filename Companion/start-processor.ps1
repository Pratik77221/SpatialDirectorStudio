$ErrorActionPreference = "Stop"

$projectRef = "gumuwtyxxwwivppzqtyt"
$projectUrl = "https://gumuwtyxxwwivppzqtyt.supabase.co"
$keys = npx --yes supabase@latest projects api-keys --project-ref $projectRef --reveal --output json | ConvertFrom-Json
$serviceRoleKey = ($keys | Where-Object { $_.name -eq "service_role" } | Select-Object -First 1).api_key
if (-not $serviceRoleKey) {
  throw "Supabase service role key was not returned for project $projectRef"
}

$env:SUPABASE_URL = $projectUrl
$env:SUPABASE_SERVICE_ROLE_KEY = $serviceRoleKey
$env:STORAGE_BUCKET = "director-takes"
$env:PROCESSOR_SHARED_SECRET = [guid]::NewGuid().ToString("N")
$env:PROCESSOR_POLL = "true"
npx tsx backend/processor.ts
