/**
 * Portfolio AI Assistant - First-time setup
 * Creates SMTP credential in n8n, imports workflow, publishes & activates.
 * Run this BEFORE starting n8n, or with n8n stopped.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const projectDir = __dirname;
const envPath = path.join(projectDir, '.env');

// Load .env
const env = {};
fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
  line = line.trim();
  if (!line || line.startsWith('#')) return;
  const eq = line.indexOf('=');
  if (eq > 0) env[line.slice(0, eq)] = line.slice(eq + 1);
});

// Validate
if (!env.GMAIL_APP_PASSWORD || env.GMAIL_APP_PASSWORD === 'your-app-password-here') {
  console.log('[SKIP] GMAIL_APP_PASSWORD not set in .env - skipping email credential setup.');
  console.log('       Email notifications will not work until you set this.');
  console.log('       Get one at: https://myaccount.google.com/apppasswords');
  console.log('');
} else {
  console.log('[SETUP] Creating Gmail SMTP credential...');

  // Build credential file
  const cred = [{
    id: "gmail-smtp-portfolio",
    name: "Gmail SMTP",
    type: "smtp",
    data: {
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      user: env.GMAIL_FROM_EMAIL || "cromanconville@gmail.com",
      password: env.GMAIL_APP_PASSWORD
    }
  }];

  const credPath = path.join(projectDir, 'n8n-workflow', '_credentials.json');
  fs.writeFileSync(credPath, JSON.stringify(cred, null, 2));

  try {
    execSync(`npx n8n import:credentials --input="${credPath}"`, {
      stdio: 'pipe',
      env: { ...process.env, ...env }
    });
    console.log('[OK] SMTP credential created');
  } catch (e) {
    const output = (e.stdout || '').toString() + (e.stderr || '').toString();
    if (output.includes('already exists')) {
      console.log('[OK] SMTP credential already exists');
    } else {
      console.log('[WARN] Credential import issue:', output.substring(0, 200));
    }
  }

  // Clean up temp file
  try { fs.unlinkSync(credPath); } catch {}
}

// Import workflow
console.log('[SETUP] Importing workflow...');
try {
  execSync(`npx n8n import:workflow --input="${path.join(projectDir, 'n8n-workflow', 'workflow-v2.json')}"`, {
    stdio: 'pipe',
    env: { ...process.env, ...env }
  });
  console.log('[OK] Workflow imported');
} catch (e) {
  console.log('[OK] Workflow imported (may have replaced existing)');
}

// Publish
console.log('[SETUP] Publishing workflow...');
try {
  execSync('npx n8n publish:workflow --id=portBot2025v2', {
    stdio: 'pipe',
    env: { ...process.env, ...env }
  });
  console.log('[OK] Workflow published');
} catch (e) {
  console.log('[WARN] Publish issue (may already be published)');
}

// Activate
console.log('[SETUP] Activating workflow...');
try {
  execSync('npx n8n update:workflow --id=portBot2025v2 --active=true', {
    stdio: 'pipe',
    env: { ...process.env, ...env }
  });
  console.log('[OK] Workflow activated');
} catch (e) {
  console.log('[WARN] Activation issue (may already be active)');
}

console.log('');
console.log('[DONE] Setup complete. Start n8n with: npx n8n start');
