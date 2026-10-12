import { loadEnv } from 'vite';

const env = { ...loadEnv('production', process.cwd(), 'VITE_'), ...process.env };
const required = [
  'VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID',
  'VITE_FIREBASE_APPCHECK_SITE_KEY',
];
const missing = required.filter((name) => !env[name]);
if (env.VITE_PACKPROOF_PROVIDER !== 'firebase_ai_logic') missing.unshift('VITE_PACKPROOF_PROVIDER=firebase_ai_logic');
if (env.VITE_FIREBASE_APPCHECK_DEBUG === 'true') missing.push('production reCAPTCHA Enterprise site key (debug App Check is development-only)');
if (env.VITE_GEMINI_API_KEY || env.VITE_GOOGLE_API_KEY || env.VITE_VERTEX_API_KEY) missing.push('remove any client-side Gemini/Vertex API key variable');
if (missing.length) {
  console.error(`Firebase Hosting build blocked. Set: ${missing.join(', ')}.`);
  process.exit(1);
}
console.log('Firebase Hosting config is present; public Firebase/App Check web config only.');
