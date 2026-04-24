const REALTIME_BRIDGE_KEY = Symbol.for('game-hub.realtime-bridge')

const globalState = globalThis

if (!globalState[REALTIME_BRIDGE_KEY]) {
  globalState[REALTIME_BRIDGE_KEY] = {
    sendToUser: null,
  }
}

const realtimeBridge = globalState[REALTIME_BRIDGE_KEY]

export function registerRealtimeSender(sendToUser) {
  realtimeBridge.sendToUser = sendToUser
}

export function emitRealtimeToUser(userId, payload) {
  if (!realtimeBridge.sendToUser) {
    return false
  }

  realtimeBridge.sendToUser(userId, payload)
  return true
}
