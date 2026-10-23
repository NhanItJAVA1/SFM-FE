const knownProductionApiHosts = new Set(['sfmbe.duckdns.org']);

function normalizeHost(value: string) {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return '';
  try {
    return new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`).hostname.toLowerCase();
  } catch {
    return trimmed.replace(/:\d+$/, '');
  }
}

export function isProductionLoadTestTarget(apiUrl = process.env.EXPO_PUBLIC_API_URL) {
  if (!apiUrl) return false;

  let apiHost: string;
  try {
    apiHost = new URL(apiUrl).hostname.toLowerCase();
  } catch {
    return false;
  }

  const configuredProductionHosts = (process.env.EXPO_PUBLIC_PRODUCTION_API_HOSTS ?? '')
    .split(',')
    .map(normalizeHost)
    .filter(Boolean);
  const isConfiguredProductionHost = [...knownProductionApiHosts, ...configuredProductionHosts]
    .some(host => apiHost === host || apiHost.endsWith(`.${host}`));
  const hasProductionHostnameLabel = /(^|[.-])(prod|production)([.-]|$)/i.test(apiHost);

  return process.env.NODE_ENV === 'production' || isConfiguredProductionHost || hasProductionHostnameLabel;
}
