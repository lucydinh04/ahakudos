// Single source of runtime configuration for the Vercel layer. Every value comes from environment
// variables; nothing environment-specific is hard-coded elsewhere. See docs/README_DEPLOY.md.
import { HttpError } from './http.js';

const ENVS = ['development', 'staging', 'production'];
const HEX64 = /^[a-f0-9]{64}$/;

function str(name, fallback = '') {
  const v = process.env[name];
  return v === undefined || v === null || String(v).trim() === '' ? fallback : String(v).trim();
}
function httpsOrigin(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' || u.username || u.password || u.pathname !== '/' || u.search || u.hash) return '';
    return u.origin;
  } catch { return ''; }
}

/** Reads and validates configuration. Throws HttpError(503) on any unsafe or missing value (fail closed). */
export function getConfig() {
  const problems = [];
  const vercelEnv = str('VERCEL_ENV');
  let env = str('AHA_ENV').toLowerCase();
  if (!env) env = vercelEnv === 'production' ? '' : 'development';
  if (!ENVS.includes(env)) problems.push('AHA_ENV phải là development | staging | production.');

  const appOrigin = httpsOrigin(str('APP_ORIGIN').replace(/\/+$/, '') + '/');
  if (!appOrigin) problems.push('APP_ORIGIN phải là origin HTTPS, ví dụ https://handbook.ahamove.com');

  const basePath = str('APP_BASE_PATH').replace(/\/+$/, '');
  if (basePath && !/^(\/[a-z0-9][a-z0-9-]*)+$/.test(basePath)) problems.push('APP_BASE_PATH không hợp lệ (ví dụ /ahakudos).');

  const handbookOrigin = httpsOrigin(str('HANDBOOK_ORIGIN', 'https://handbook.ahamove.com').replace(/\/+$/, '') + '/');

  const gasUrl = str('GAS_EXEC_URL');
  if (!/^https:\/\/script\.google\.com\/(?:macros\/s\/|a\/macros\/[A-Za-z0-9.-]+\/s\/)[A-Za-z0-9_-]+\/exec$/.test(gasUrl)) problems.push('GAS_EXEC_URL phải là Web app URL Apps Script kết thúc bằng /exec.');
  const bridgeSecret = str('GAS_BRIDGE_SECRET');
  if (!HEX64.test(bridgeSecret)) problems.push('GAS_BRIDGE_SECRET cần đúng 64 ký tự hex.');

  const identityModes = str('IDENTITY_MODE', env === 'production' ? 'oidc' : 'oidc').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  const devEnabled = str('ENABLE_DEV_IDENTITY', 'false') === 'true';
  const devKey = str('DEV_ACCESS_KEY');
  if (identityModes.some(m => !['oidc', 'trusted_header', 'dev'].includes(m))) problems.push('IDENTITY_MODE chỉ gồm oidc, trusted_header, dev.');
  if (env === 'production' && (devEnabled || identityModes.includes('dev'))) problems.push('Production KHÔNG được bật ENABLE_DEV_IDENTITY hoặc IDENTITY_MODE=dev.');
  if (identityModes.includes('dev') && (!devEnabled || !HEX64.test(devKey))) problems.push('IDENTITY_MODE=dev cần ENABLE_DEV_IDENTITY=true và DEV_ACCESS_KEY (64 hex).');
  if (devKey && devKey === bridgeSecret) problems.push('DEV_ACCESS_KEY phải khác GAS_BRIDGE_SECRET.');

  const issuer = str('OIDC_ISSUER', 'https://auth.ahamove.com/realms/hr').replace(/\/+$/, '');
  const trustedSecret = str('TRUSTED_PROXY_SECRET');
  if (identityModes.includes('trusted_header') && !HEX64.test(trustedSecret)) problems.push('IDENTITY_MODE=trusted_header cần TRUSTED_PROXY_SECRET (64 hex) do proxy AhaHandbook gửi kèm.');

  if (problems.length) throw new HttpError(503, 'Cấu hình AhaKudos chưa hợp lệ.', 'CONFIG', problems);

  return Object.freeze({
    env, appOrigin, basePath, handbookOrigin, gasUrl, bridgeSecret,
    allowedDomain: str('ALLOWED_EMAIL_DOMAIN', 'ahamove.com').toLowerCase(),
    identityModes,
    dev: { enabled: devEnabled && env !== 'production', key: devKey },
    oidc: {
      issuer,
      jwksUrl: str('OIDC_JWKS_URL', issuer + '/protocol/openid-connect/certs'),
      audience: str('OIDC_AUDIENCE', 'handbook'),
      tokenHeaders: str('OIDC_TOKEN_HEADERS', 'x-forwarded-access-token,x-auth-request-access-token,authorization').toLowerCase().split(',').map(s => s.trim()).filter(Boolean),
      emailClaim: str('OIDC_EMAIL_CLAIM', 'email'),
      clockSkewSec: Number(str('OIDC_CLOCK_SKEW_SEC', '60')) || 60
    },
    trusted: {
      emailHeader: str('TRUSTED_EMAIL_HEADER', 'x-auth-request-email').toLowerCase(),
      secretHeader: str('TRUSTED_PROXY_SECRET_HEADER', 'x-ahakudos-proxy-secret').toLowerCase(),
      secret: trustedSecret
    },
    buildId: (str('VERCEL_GIT_COMMIT_SHA') || str('BUILD_ID') || 'dev').slice(0, 12)
  });
}

/** Non-secret summary for /api/health. */
export function configSummary() {
  try {
    const c = getConfig();
    return { ok: true, env: c.env, identityModes: c.identityModes, basePath: c.basePath || '/', devIdentity: c.dev.enabled, buildId: c.buildId };
  } catch (e) {
    return { ok: false, problems: e.details || [e.message] };
  }
}
