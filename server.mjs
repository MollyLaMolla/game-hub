import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import http from 'node:http'
import next from 'next'
import { Pool } from 'pg'
import { WebSocketServer } from 'ws'
import { registerRealtimeSender } from './lib/realtime-bridge.mjs'

const dev = process.env.NODE_ENV !== 'production'
const hostname = process.env.HOST || 'localhost'
const port = Number(process.env.PORT || 3000)

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()
const databasePool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : null

const websocketClientsByUserId = new Map()
const websocketMeta = new WeakMap()
const HEARTBEAT_INTERVAL_MS = 30000

const SESSION_COOKIE_NAMES = [
  '__Secure-next-auth.session-token',
  'next-auth.session-token',
  '__Secure-authjs.session-token',
  'authjs.session-token',
]

function parseCookies(cookieHeader = '') {
  return cookieHeader.split(';').reduce((cookies, chunk) => {
    const separatorIndex = chunk.indexOf('=')

    if (separatorIndex === -1) {
      return cookies
    }

    const key = chunk.slice(0, separatorIndex).trim()
    const value = chunk.slice(separatorIndex + 1).trim()

    if (!key) {
      return cookies
    }

    cookies[key] = decodeURIComponent(value)
    return cookies
  }, {})
}

function getSessionTokenFromRequest(request) {
  const cookies = parseCookies(request.headers.cookie)

  for (const cookieName of SESSION_COOKIE_NAMES) {
    if (cookies[cookieName]) {
      return cookies[cookieName]
    }
  }

  return null
}

async function getAuthenticatedUserFromRequest(request) {
  if (!databasePool) {
    return null
  }

  const sessionToken = getSessionTokenFromRequest(request)

  if (!sessionToken) {
    return null
  }

  const result = await databasePool.query(
    `
      SELECT
        "User"."id",
        COALESCE("User"."inGameName", 'Player') AS "inGameName",
        COALESCE("User"."tag", 'READY') AS "tag",
        COALESCE("User"."avatarUrl", '/images/profile_icons/fox.png') AS "avatarUrl"
      FROM "Session"
      INNER JOIN "User" ON "User"."id" = "Session"."userId"
      WHERE "Session"."sessionToken" = $1
        AND "Session"."expires" > NOW()
      LIMIT 1
    `,
    [sessionToken]
  )

  return result.rows[0] || null
}

function rejectUpgrade(socket, statusCode, message) {
  socket.write(
    `HTTP/1.1 ${statusCode} ${message}\r\nConnection: close\r\nContent-Type: text/plain\r\n\r\n${message}`
  )
  socket.destroy()
}

function sendJson(socket, payload) {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(payload))
  }
}

function broadcastPresence() {
  const payload = {
    type: 'presence',
    onlineUserIds: [...websocketClientsByUserId.keys()],
  }

  for (const sockets of websocketClientsByUserId.values()) {
    for (const socket of sockets) {
      sendJson(socket, payload)
    }
  }
}

function addSocket(userId, socket) {
  const sockets = websocketClientsByUserId.get(userId) || new Set()
  sockets.add(socket)
  websocketClientsByUserId.set(userId, sockets)
  broadcastPresence()
}

function markSocketAlive(socket) {
  const meta = websocketMeta.get(socket)

  if (!meta) {
    return
  }

  meta.isAlive = true
}

function removeSocket(socket) {
  const meta = websocketMeta.get(socket)

  if (!meta) {
    return
  }

  const sockets = websocketClientsByUserId.get(meta.userId)

  if (sockets) {
    sockets.delete(socket)

    if (!sockets.size) {
      websocketClientsByUserId.delete(meta.userId)
    }
  }

  websocketMeta.delete(socket)
  broadcastPresence()
}

function sendToUser(userId, payload) {
  const sockets = websocketClientsByUserId.get(userId)

  if (!sockets) {
    return
  }

  for (const socket of sockets) {
    sendJson(socket, payload)
  }
}

registerRealtimeSender(sendToUser)

app.prepare().then(() => {
  const handleUpgrade = app.getUpgradeHandler()

  const server = http.createServer((request, response) => {
    handle(request, response)
  })

  const websocketServer = new WebSocketServer({ noServer: true })
  const heartbeatInterval = setInterval(() => {
    for (const socket of websocketServer.clients) {
      const meta = websocketMeta.get(socket)

      if (!meta) {
        continue
      }

      if (!meta.isAlive) {
        socket.terminate()
        continue
      }

      meta.isAlive = false
      socket.ping()
    }
  }, HEARTBEAT_INTERVAL_MS)

  websocketServer.on('connection', (socket, request, sessionUser) => {
    addSocket(sessionUser.id, socket)
    websocketMeta.set(socket, {
      ...sessionUser,
      userId: sessionUser.id,
      isAlive: true,
    })

    sendJson(socket, {
      type: 'presence',
      onlineUserIds: [...websocketClientsByUserId.keys()],
    })

    socket.on('pong', () => {
      markSocketAlive(socket)
    })

    socket.on('message', rawMessage => {
      try {
        const message = JSON.parse(rawMessage.toString())
        const sessionMeta = websocketMeta.get(socket)

        if (
          message.type === 'invite_to_lobby' &&
          message.targetUserId &&
          message.gameKey === 'tictactoe' &&
          sessionMeta
        ) {
          sendToUser(message.targetUserId, {
            type: 'lobby_invite',
            invite: {
              id: randomUUID(),
              from: {
                id: sessionMeta.id,
                inGameName: sessionMeta.inGameName,
                tag: sessionMeta.tag,
                avatarUrl: sessionMeta.avatarUrl,
              },
              lobbyName: 'TicTacToe',
              lobbyPath: '/TicTacToe',
              gameKey: 'tictactoe',
            },
          })
        }
      } catch {
        sendJson(socket, {
          type: 'error',
          error: 'Invalid websocket payload.',
        })
      }
    })

    socket.on('close', () => {
      removeSocket(socket)
    })

    socket.on('error', () => {
      removeSocket(socket)
    })
  })

  server.on('upgrade', async (request, socket, head) => {
    const url = new URL(request.url || '/', `http://${request.headers.host}`)

    if (url.pathname !== '/ws') {
      await handleUpgrade(request, socket, head)
      return
    }

    const sessionUser = await getAuthenticatedUserFromRequest(request)

    if (!sessionUser) {
      rejectUpgrade(socket, 401, 'Unauthorized websocket session.')
      return
    }

    websocketServer.handleUpgrade(request, socket, head, upgradedSocket => {
      websocketServer.emit('connection', upgradedSocket, request, sessionUser)
    })
  })

  server
    .once('error', error => {
      console.error(error)
      process.exit(1)
    })
    .once('close', () => {
      clearInterval(heartbeatInterval)
    })
    .listen(port, hostname, () => {
      console.log(`> Ready on http://${hostname}:${port}`)
    })
})
