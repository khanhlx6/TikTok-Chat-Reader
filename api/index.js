// Vercel serverless entrypoint (optional).
//
// This re-exports the regular Express + Socket.IO server from server.js, so the same code
// base runs on a VPS / Render / Docker (node server.js) and on Vercel Functions.
//
// Notes for Vercel:
// - Vercel keeps the Socket.IO connection on the function instance that opened it and closes
//   it when the function reaches its max duration (300 s on Hobby), so the client reconnects
//   automatically (public/connection.js re-emits setUniqueId with the saved options).
// - This project works best on a long-lived host. Render (render.yaml), a VPS or Docker is
//   recommended for long OBS overlays; Vercel is fine for quick tests and normal usage.
const { httpServer } = require('../server');

module.exports = httpServer;
