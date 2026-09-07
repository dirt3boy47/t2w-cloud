$ErrorActionPreference = 'Stop'

function Require-Command([string]$Name, [string]$Message) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw $Message
  }
}

function Put-WorkerSecret([string]$Name) {
  Write-Host ""
  Write-Host "Enter $Name" -ForegroundColor Cyan
  $secure = Read-Host -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    if ([string]::IsNullOrWhiteSpace($plain)) { throw "$Name cannot be blank." }
    $plain | npx wrangler secret put $Name
    if ($LASTEXITCODE -ne 0) { throw "Failed to set $Name in Cloudflare." }
  }
  finally {
    if ($ptr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
    $plain = $null
  }
}

Require-Command node 'Node.js is not installed. Install Node.js 22 LTS or later first.'
Require-Command npm 'npm is not installed. Install Node.js 22 LTS or later first.'
Require-Command docker 'Docker Desktop is not installed. Install and start Docker Desktop first.'

Write-Host 'Checking Docker...' -ForegroundColor Cyan
docker info *> $null
if ($LASTEXITCODE -ne 0) { throw 'Docker is installed but the Docker engine is not running.' }

Write-Host 'Installing T2W dependencies...' -ForegroundColor Cyan
npm install
if ($LASTEXITCODE -ne 0) { throw 'npm install failed.' }

Write-Host 'Verifying T2W build...' -ForegroundColor Cyan
npm run verify
if ($LASTEXITCODE -ne 0) { throw 'T2W verification failed.' }

Write-Host 'Checking Cloudflare login...' -ForegroundColor Cyan
npx wrangler whoami
if ($LASTEXITCODE -ne 0) {
  npx wrangler login
  if ($LASTEXITCODE -ne 0) { throw 'Cloudflare login failed.' }
}

Write-Host ''
Write-Host 'The next six values are stored as encrypted Cloudflare Worker secrets.' -ForegroundColor Yellow
Write-Host 'They are not written into the T2W source folder.' -ForegroundColor Yellow

Put-WorkerSecret 'DATABASE_URL'
Put-WorkerSecret 'SUPABASE_URL'
Put-WorkerSecret 'SUPABASE_PUBLISHABLE_KEY'
Put-WorkerSecret 'SUPABASE_SECRET_KEY'
Put-WorkerSecret 'T2W_SESSION_SECRET'
Put-WorkerSecret 'T2W_ADMIN_PASS'

Write-Host ''
Write-Host 'Deploying T2W to Cloudflare...' -ForegroundColor Cyan
npm run deploy
if ($LASTEXITCODE -ne 0) { throw 'Cloudflare deployment failed.' }

Write-Host ''
Write-Host 'Deployment command completed. Cloudflare may take several minutes to provision the first Container.' -ForegroundColor Green
Write-Host 'Check status with: npx wrangler containers list' -ForegroundColor Green
