/**
 * Yjs WebSocket server — one CRDT document per workspace room.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");
const Y = require("yjs");
const {
  setupWSConnection,
  setPersistence,
  setContentInitializor,
} = require("./lib/yjs-ws-server");
const roomSeeds = require("./data/room-seeds.js");

const DOC_DIR = path.join(__dirname, "data", "yjs-docs");
const HOST = process.env.YJS_HOST || process.env.HOST || "localhost";
const PORT = Number(process.env.YJS_PORT || process.env.PORT || 1234);

fs.mkdirSync(DOC_DIR, { recursive: true });

function docPath(docName) {
  return path.join(DOC_DIR, `${docName}.bin`);
}

const saveTimers = new Map();

function scheduleSave(docName, ydoc) {
  if (saveTimers.has(docName)) clearTimeout(saveTimers.get(docName));
  saveTimers.set(
    docName,
    setTimeout(() => {
      saveTimers.delete(docName);
      try {
        fs.writeFileSync(docPath(docName), Buffer.from(Y.encodeStateAsUpdate(ydoc)));
      } catch (err) {
        console.error(`[Yjs] Failed to save ${docName}:`, err.message);
      }
    }, 1500)
  );
}

setPersistence({
  bindState: async (docName, ydoc) => {
    const file = docPath(docName);
    if (fs.existsSync(file)) {
      Y.applyUpdate(ydoc, fs.readFileSync(file));
    }
    ydoc.on("update", () => scheduleSave(docName, ydoc));
  },
  writeState: async (docName, ydoc) => {
    if (saveTimers.has(docName)) {
      clearTimeout(saveTimers.get(docName));
      saveTimers.delete(docName);
    }
    fs.writeFileSync(docPath(docName), Buffer.from(Y.encodeStateAsUpdate(ydoc)));
  },
});

setContentInitializor(async (ydoc) => {
  const docName = ydoc.name;
  const ytext = ydoc.getText("source");
  if (ytext.length > 0) return;

  const seed = roomSeeds[docName];
  if (seed) {
    ytext.insert(0, seed);
    scheduleSave(docName, ydoc);
  }
});

const server = http.createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("EditAura Yjs WebSocket server\n");
});

const wss = new WebSocketServer({ noServer: true });
wss.on("connection", (ws, req) => setupWSConnection(ws, req));

server.on("upgrade", (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[Yjs] WebSocket server at ws://${HOST}:${PORT}`);
});

server.on("error", (err) => {
  console.error("[Yjs] Server error:", err.code === "EADDRINUSE" ? `Port ${PORT} in use` : err);
  process.exit(1);
});

module.exports = { server, PORT, HOST };
