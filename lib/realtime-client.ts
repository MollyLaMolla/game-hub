export function getRealtimeWebSocketUrl() {
  const configuredOrigin = process.env.NEXT_PUBLIC_REALTIME_ORIGIN?.trim()
  const baseOrigin = configuredOrigin || window.location.origin
  const realtimeUrl = new URL(baseOrigin)

  if (realtimeUrl.protocol === 'https:') {
    realtimeUrl.protocol = 'wss:'
  } else if (realtimeUrl.protocol === 'http:') {
    realtimeUrl.protocol = 'ws:'
  } else if (realtimeUrl.protocol !== 'ws:' && realtimeUrl.protocol !== 'wss:') {
    realtimeUrl.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  }

  realtimeUrl.pathname = '/ws'
  realtimeUrl.search = ''
  realtimeUrl.hash = ''

  return realtimeUrl.toString()
}
