export function getRaceSocketUrl() {
  const configured = import.meta.env.VITE_RACE_SERVER_URL;
  if (configured) return configured.replace(/^http/, 'ws').replace(/\/$/, '') + '/ws';
  if (typeof window === 'undefined') return 'ws://localhost:3001/ws';
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const devPort = ['5173', '4173'].includes(window.location.port) ? ':3001' : '';
  return `${protocol}//${window.location.hostname}${devPort || (window.location.port ? `:${window.location.port}` : '')}/ws`;
}
