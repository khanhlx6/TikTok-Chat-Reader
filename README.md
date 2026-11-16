# TikTok-Chat-Reader
A chat reader for <a href="https://www.tiktok.com/live">TikTok LIVE</a> utilizing <a href="https://github.com/zerodytrash/TikTok-Live-Connector">TikTok-Live-Connector</a> and <a href="https://socket.io/">Socket.IO</a> to forward the data to the client. This demo project uses the unofficial TikTok API to retrieve chat comments, gifts and other events from TikTok LIVE.

## Demo: https://tiktok-chat-reader.zerody.one/

## Installation
To run the chat reader locally, follow these steps:

1. Install [Node.js](https://nodejs.org/) on your system
2. Clone this repository or download and extract [this ZIP file](https://github.com/zerodytrash/TikTok-Chat-Reader/archive/refs/heads/main.zip)
3. Open a console/terminal in the root directory of the project
4. Enter `npm i` to install all required dependencies 
5. Enter `node server.js` to start the application server

Now you should see the following message: `Server running! Please visit http://localhost:8081`<br>
Simply open http://localhost:8081/ in your browser. Thats it.

If you have problems with Node.js, you can also just open the `index.html` from the `public` folder.<br>
This will use the server backend of the [demo site](https://tiktok-chat-reader.zerody.one/), which is sufficient for testing purposes. If you want to offer it to others or make many connections at the same time, please consider using your own server.

> `tiktok-live-connector` is pinned to the exact version `2.1.1-beta1`. Version `2.5.0` removed the legacy `WebcastPushConnection` API and crashes this project with `TypeError: WebcastPushConnection is not a constructor`.

## Deployment (GitHub Pages + Backend Server)

GitHub Pages (`https://khanhlx6.github.io/TikTok-Chat-Reader/`) hosts the static frontend in `./public`. Because `https://tiktok-chat-reader.zerody.one/` enforces domain-locked Google reCAPTCHA v2, deploy your own `server.js` instance (no reCAPTCHA required by default):

1. Deploy `server.js` to [Render](https://dashboard.render.com/blueprint/new?repo=https://github.com/khanhlx6/TikTok-Chat-Reader) (via `render.yaml`), Railway, Koyeb, Fly.io, or a VPS using the included `Dockerfile`.
2. Open `https://khanhlx6.github.io/TikTok-Chat-Reader/`, click **Server**, paste your backend URL (e.g. `https://tiktok-chat-reader-backend.onrender.com`), and click **Save Server** — or pass `?backend=https://your-backend-url` in the URL.
3. To make all visitors use your backend automatically, set `DEFAULT_STATIC_BACKEND_URL` at the top of `public/app.js` to your deployed backend URL.

### Docker

```bash
docker build -t tiktok-chat-reader .
docker run -p 8081:8081 tiktok-chat-reader
```

The image serves the frontend and the Socket.IO backend from the same origin, so no CORS configuration is needed.

## Troubleshooting

**`reCAPTCHA verification required.`** — the public demo backend (`tiktok-chat-reader.zerody.one`) protects its connections with a Google reCAPTCHA v2 key that is locked to its own domain, so a GitHub Pages copy of the frontend can never pass it. Fixes, from best to quickest:

1. **Host your own backend** (recommended, no captcha by default): deploy this repository to Render with the included `render.yaml`, run the `Dockerfile`, or use `npm i && npm start` on any VPS. Then click **Server** in the web UI, enter your backend URL and press **Save Server** (stored in `localStorage`). Alternatively pass it in the URL: `?backend=https://your-backend.onrender.com`.
2. **Use a 24-hour overlay bypass token**: on <https://tiktok-chat-reader.zerody.one/> enter any username, click **Generate Overlay URL**, solve the captcha, then copy the `token=...` value from the opened `obs.html` URL into the **Server → Bypass Token** field of your GitHub Pages copy.
3. **Set `DEFAULT_STATIC_BACKEND_URL`** in `public/app.js` to your deployed backend URL so every visitor uses it without any manual configuration.

**`WebcastPushConnection is not a constructor`** — an incompatible `tiktok-live-connector` version was installed. Delete `node_modules` and `package-lock.json`, then reinstall with the pinned version: `npm i`.

**GitHub Pages shows the old version** — Pages only publishes `./public`; wait for the "Deploy static content to Pages" workflow to finish and hard-refresh (Ctrl/Cmd + Shift + R).

## Screenshot

![TikTok LIVE Chat Reader (Demo)](.demo/demo-image.png)
