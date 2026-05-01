import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors'
import { Database } from 'bun:sqlite'
import { jwt } from '@elysiajs/jwt' // опционально, для теста можно без него

// --- DB INIT ---
const db = new Database('app.db', { create: true })
db.run(`PRAGMA journal_mode=WAL;`)
db.run(`PRAGMA synchronous=NORMAL;`)
db.run(`PRAGMA busy_timeout=5000;`)
db.run(`PRAGMA cache_size=-32000;`)

db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`)

// --- APP ---
const app = new Elysia()
  .use(cors())

// Health / Metrics
app.get('/health', () => ({ status: 'ok', uptime: process.uptime() }))

// Mock Login (без реального хеширования для скорости теста)
app.post('/login', {
  body: { username: '', password: '' }
}, ({ body }) => {
  if (!body.username || body.username.length < 3) 
    return { error: 'invalid_username' }
  
  // В проде: bcrypt/argon2, здесь просто эмуляция
  return { token: `mock_jwt_${body.username}`, username: body.username }
})

// Stream Status (кешируемый эндпоинт)
app.get('/stream/status', () => ({
  is_live: false,
  viewers: 0,
  title: 'Test Stream',
  hls_url: 'https://s3.timeweb.com/bucket/stream/index.m3u8'
}))

// WebSocket Chat
const clients = new Set()
app.ws('/ws/chat', {
  open(ws) {
    clients.add(ws)
    ws.send(JSON.stringify({ type: 'system', text: 'Connected' }))
  },
  message(ws, message) {
    const payload = JSON.stringify({ type: 'chat', user: ws.data?.user || 'anon', text: message })
    clients.forEach(c => {
      if (c.readyState === 1) c.send(payload)
    })
  },
  close(ws) { clients.delete(ws) }
})

// Graceful shutdown
const shutdown = () => {
  console.log('> Shutting down...')
  clients.forEach(c => c.close(1000, 'Server restarting'))
  db.close()
  process.exit(0)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

app.listen(3000)
console.log(`> Elysia running on http://localhost:3000`)
