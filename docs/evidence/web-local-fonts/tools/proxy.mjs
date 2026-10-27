// Logging proxy that rejects every request. Usage: node proxy.mjs PORT LOGFILE
import http from "node:http";
import fs from "node:fs";
const [port, logFile] = process.argv.slice(2);
const log = (rec) => fs.appendFileSync(logFile, JSON.stringify({ t: new Date().toISOString(), ...rec }) + "\n");
const server = http.createServer((req, res) => {
  log({ kind: "http", method: req.method, target: req.url, host: req.headers.host, status: 403 });
  res.writeHead(403, { "content-type": "text/plain" }).end("blocked by local-fonts proof proxy\n");
});
server.on("connect", (req, socket) => {
  log({ kind: "connect", method: "CONNECT", target: req.url, status: 403 });
  socket.end("HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n");
});
server.listen(Number(port), "127.0.0.1", () => log({ kind: "listening", port: Number(port) }));
