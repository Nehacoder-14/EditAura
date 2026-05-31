/**
 * Minimal y-websocket-compatible server (yjs 13 + y-protocols).
 * Based on the y-websocket-server reference implementation.
 */
const Y = require("yjs");
const syncProtocol = require("y-protocols/sync");
const awarenessProtocol = require("y-protocols/awareness");
const encoding = require("lib0/encoding");
const decoding = require("lib0/decoding");
const map = require("lib0/map");

const wsReadyStateConnecting = 0;
const wsReadyStateOpen = 1;

const messageSync = 0;
const messageAwareness = 1;

/** @type {{ bindState: Function, writeState: Function } | null} */
let persistence = null;

/** @type {(ydoc: Y.Doc) => Promise<void>} */
let contentInitializor = () => Promise.resolve();

const docs = new Map();

class WSSharedDoc extends Y.Doc {
  constructor(name) {
    super({ gc: true });
    this.name = name;
    this.conns = new Map();
    this.awareness = new awarenessProtocol.Awareness(this);
    this.awareness.setLocalState(null);

    const awarenessChangeHandler = ({ added, updated, removed }, conn) => {
      const changed = added.concat(updated, removed);
      if (conn) {
        const controlled = this.conns.get(conn);
        if (controlled) {
          added.forEach((id) => controlled.add(id));
          removed.forEach((id) => controlled.delete(id));
        }
      }
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageAwareness);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, changed)
      );
      const buff = encoding.toUint8Array(encoder);
      this.conns.forEach((_, c) => send(this, c, buff));
    };

    this.awareness.on("update", awarenessChangeHandler);

    const updateHandler = (update) => {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageSync);
      syncProtocol.writeUpdate(encoder, update);
      const message = encoding.toUint8Array(encoder);
      this.conns.forEach((_, conn) => send(this, conn, message));
    };

    this.on("update", updateHandler);
    this.whenInitialized = contentInitializor(this);
  }
}

function setPersistence(p) {
  persistence = p;
}

function setContentInitializor(fn) {
  contentInitializor = fn;
}

function getYDoc(docname) {
  return map.setIfUndefined(docs, docname, () => {
    const doc = new WSSharedDoc(docname);
    if (persistence) {
      persistence.bindState(docname, doc);
    }
    return doc;
  });
}

function closeConn(doc, conn) {
  if (!doc.conns.has(conn)) return;

  const controlledIds = doc.conns.get(conn);
  doc.conns.delete(conn);
  awarenessProtocol.removeAwarenessStates(doc.awareness, Array.from(controlledIds), null);

  if (doc.conns.size === 0 && persistence) {
    persistence.writeState(doc.name, doc).then(() => {
      doc.destroy();
      docs.delete(doc.name);
    });
  }
  conn.close();
}

function send(doc, conn, m) {
  if (conn.readyState !== wsReadyStateConnecting && conn.readyState !== wsReadyStateOpen) {
    closeConn(doc, conn);
    return;
  }
  try {
    conn.send(m, {}, (err) => {
      if (err) closeConn(doc, conn);
    });
  } catch {
    closeConn(doc, conn);
  }
}

function messageListener(conn, doc, message) {
  const encoder = encoding.createEncoder();
  const decoder = decoding.createDecoder(message);
  const messageType = decoding.readVarUint(decoder);

  switch (messageType) {
    case messageSync:
      encoding.writeVarUint(encoder, messageSync);
      syncProtocol.readSyncMessage(decoder, encoder, doc, conn);
      if (encoding.length(encoder) > 1) {
        send(doc, conn, encoding.toUint8Array(encoder));
      }
      break;
    case messageAwareness:
      awarenessProtocol.applyAwarenessUpdate(
        doc.awareness,
        decoding.readVarUint8Array(decoder),
        conn
      );
      break;
    default:
      break;
  }
}

function setupWSConnection(conn, req, opts = {}) {
  const docName = opts.docName || (req.url || "").slice(1).split("?")[0];
  const doc = getYDoc(docName);
  doc.conns.set(conn, new Set());

  conn.on("message", (message) => {
    messageListener(conn, doc, new Uint8Array(message));
  });

  let pongReceived = true;
  const pingInterval = setInterval(() => {
    if (!pongReceived) {
      if (doc.conns.has(conn)) closeConn(doc, conn);
      clearInterval(pingInterval);
      return;
    }
    if (doc.conns.has(conn)) {
      pongReceived = false;
      try {
        conn.ping();
      } catch {
        closeConn(doc, conn);
        clearInterval(pingInterval);
      }
    }
  }, 30000);

  conn.on("close", () => {
    closeConn(doc, conn);
    clearInterval(pingInterval);
  });

  conn.on("pong", () => {
    pongReceived = true;
  });

  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync);
  syncProtocol.writeSyncStep1(encoder, doc);
  send(doc, conn, encoding.toUint8Array(encoder));

  const awarenessStates = doc.awareness.getStates();
  if (awarenessStates.size > 0) {
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, messageAwareness);
    encoding.writeVarUint8Array(
      enc,
      awarenessProtocol.encodeAwarenessUpdate(
        doc.awareness,
        Array.from(awarenessStates.keys())
      )
    );
    send(doc, conn, encoding.toUint8Array(enc));
  }
}

module.exports = {
  setupWSConnection,
  setPersistence,
  setContentInitializor,
};
