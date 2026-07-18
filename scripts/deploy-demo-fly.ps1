# =====================================================
# Déploiement DÉMO OKITO sur Fly.io — script tout-en-un
# =====================================================
# Usage :
#   1. Charge tes variables SENSIBLES dans TON shell (les valeurs restent chez toi) :
#
#        $env:OKITO_DATABASE_URL   = "postgresql://postgres.<ref>:<pwd>@aws-0-eu-west-3.pooler.supabase.com:5432/postgres"
#        $env:OKITO_SUPABASE_URL   = "https://etlhjsypfynjyzulvkut.supabase.co"
#        $env:OKITO_SUPABASE_ANON  = "eyJhbGci..."
#        $env:OKITO_SUPABASE_JWT   = "<jwt secret>"
#        $env:OKITO_ADMIN_UUID     = "<ton uuid supabase auth>"
#        $env:OKITO_GEMINI_KEY     = "AIza..."
#        $env:OKITO_STRIPE_SECRET  = "sk_test_..."
#        $env:OKITO_STRIPE_PRICE   = "price_..."       # après création dans Stripe (étape 4 du playbook)
#        $env:OKITO_STRIPE_WHSEC   = "whsec_..."       # après création du webhook (étape 4 du playbook)
#        $env:OKITO_MARKETPLACE_PUBS = "{}"           # ou {"okito-demo":"<clé pub Ed25519 base64>"}
#
#   2. Puis :
#        cd C:\Users\aurel\Desktop\okito-v2
#        .\scripts\deploy-demo-fly.ps1 -Stage api-secrets
#        .\scripts\deploy-demo-fly.ps1 -Stage api-deploy
#        .\scripts\deploy-demo-fly.ps1 -Stage dashboard-secrets
#        .\scripts\deploy-demo-fly.ps1 -Stage dashboard-deploy
#
#   Chaque stage est indépendant et rejouable. Le script vérifie que les env
#   vars critiques sont posées avant d'appeler Fly.

param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("api-secrets", "api-deploy", "dashboard-secrets", "dashboard-deploy", "check")]
  [string]$Stage,

  [string]$ApiApp = "okito-demo-api",
  [string]$DashApp = "okito-demo-dashboard"
)

$ErrorActionPreference = "Stop"

function Require-Env {
  param([string[]]$Names)
  $missing = @()
  foreach ($n in $Names) {
    if (-not (Test-Path "env:$n")) { $missing += $n }
    elseif ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($n, "Process"))) { $missing += $n }
  }
  if ($missing.Count -gt 0) {
    Write-Host "❌ Variables d'environnement manquantes :" -ForegroundColor Red
    $missing | ForEach-Object { Write-Host "   - $_" -ForegroundColor Red }
    Write-Host "Pose-les dans ton shell (voir en-tête du script)." -ForegroundColor Yellow
    exit 1
  }
}

# Secrets fixes générés une fois pour la démo (pas des credentials tiers)
$FixedSecrets = @{
  ICAL_FEED_SECRET    = "a53ec1dfcee1f71fb76f83ff60d4fced6c5c6b4dc6141de2ab10abac560bc31b"
  REVIEW_LINK_SECRET  = "da53ccd06da3e3b205ebe60a2fb94e896b4bea26b229753b13b8a860a2be7d7b"
  MAILBOX_ENC_KEY     = "1ef42d7cc5b263001ed772a15f06fd4363f130b9dbc08f2e24ec7c3ee445c20b"
  VOICE_STREAM_SECRET = "565b5132c4f7cd2aef40e3c87468ac6382206aa810c2c6a974b15062e3d10608"
}

switch ($Stage) {
  "check" {
    Require-Env @("OKITO_DATABASE_URL","OKITO_SUPABASE_URL","OKITO_SUPABASE_JWT","OKITO_SUPABASE_ANON","OKITO_ADMIN_UUID","OKITO_GEMINI_KEY","OKITO_STRIPE_SECRET")
    Write-Host "✅ Toutes les variables critiques sont posées." -ForegroundColor Green
    Write-Host "   Prochaine étape : .\scripts\deploy-demo-fly.ps1 -Stage api-secrets"
  }

  "api-secrets" {
    Require-Env @("OKITO_DATABASE_URL","OKITO_SUPABASE_URL","OKITO_SUPABASE_JWT","OKITO_ADMIN_UUID","OKITO_GEMINI_KEY","OKITO_STRIPE_SECRET")
    if (-not $env:OKITO_STRIPE_PRICE)  { $env:OKITO_STRIPE_PRICE  = "price_placeholder_a_creer" }
    if (-not $env:OKITO_STRIPE_WHSEC)  { $env:OKITO_STRIPE_WHSEC  = "whsec_placeholder_a_creer" }
    if (-not $env:OKITO_MARKETPLACE_PUBS) { $env:OKITO_MARKETPLACE_PUBS = "{}" }

    Write-Host "→ Envoi des secrets à $ApiApp…" -ForegroundColor Cyan
    fly secrets set `
      DATABASE_URL="$env:OKITO_DATABASE_URL" `
      SUPABASE_URL="$env:OKITO_SUPABASE_URL" `
      SUPABASE_JWT_SECRET="$env:OKITO_SUPABASE_JWT" `
      GEMINI_API_KEY="$env:OKITO_GEMINI_KEY" `
      ADMIN_USER_IDS="$env:OKITO_ADMIN_UUID" `
      APP_URL="https://$DashApp.fly.dev" `
      PORTAL_URL="https://$DashApp.fly.dev/r" `
      PUBLIC_API_URL="https://$ApiApp.fly.dev" `
      ICAL_FEED_SECRET="$($FixedSecrets.ICAL_FEED_SECRET)" `
      REVIEW_LINK_SECRET="$($FixedSecrets.REVIEW_LINK_SECRET)" `
      MAILBOX_ENC_KEY="$($FixedSecrets.MAILBOX_ENC_KEY)" `
      VOICE_STREAM_SECRET="$($FixedSecrets.VOICE_STREAM_SECRET)" `
      STRIPE_SECRET_KEY="$env:OKITO_STRIPE_SECRET" `
      STRIPE_PRICE_ID="$env:OKITO_STRIPE_PRICE" `
      STRIPE_WEBHOOK_SECRET="$env:OKITO_STRIPE_WHSEC" `
      MARKETPLACE_TRUSTED_PUBLISHERS="$env:OKITO_MARKETPLACE_PUBS" `
      --stage `
      -a $ApiApp
    Write-Host "✅ Secrets stagés — seront appliqués au prochain deploy." -ForegroundColor Green
  }

  "api-deploy" {
    Push-Location apps\api
    try {
      Write-Host "→ fly deploy $ApiApp…" -ForegroundColor Cyan
      fly deploy --config fly.demo.toml -a $ApiApp
      Write-Host "→ Sanity check /health" -ForegroundColor Cyan
      try {
        $r = Invoke-RestMethod "https://$ApiApp.fly.dev/health" -TimeoutSec 30
        Write-Host "✅ /health = $($r | ConvertTo-Json -Compress)" -ForegroundColor Green
      } catch {
        Write-Host "⚠ /health n'a pas répondu 200. Lance : fly logs -a $ApiApp" -ForegroundColor Yellow
      }
    } finally { Pop-Location }
  }

  "dashboard-secrets" {
    Require-Env @("OKITO_SUPABASE_URL","OKITO_SUPABASE_ANON")
    Write-Host "→ Envoi des secrets à $DashApp…" -ForegroundColor Cyan
    fly secrets set `
      NEXT_PUBLIC_OKITO_API_URL="https://$ApiApp.fly.dev" `
      NEXT_PUBLIC_SUPABASE_URL="$env:OKITO_SUPABASE_URL" `
      NEXT_PUBLIC_SUPABASE_ANON_KEY="$env:OKITO_SUPABASE_ANON" `
      --stage `
      -a $DashApp
    Write-Host "✅ Secrets stagés." -ForegroundColor Green
  }

  "dashboard-deploy" {
    Push-Location apps\dashboard
    try {
      Write-Host "→ fly deploy $DashApp…" -ForegroundColor Cyan
      fly deploy --config fly.demo.toml -a $DashApp
      Write-Host "✅ Dashboard déployé : https://$DashApp.fly.dev" -ForegroundColor Green
    } finally { Pop-Location }
  }
}
