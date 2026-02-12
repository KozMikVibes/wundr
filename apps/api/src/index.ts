import http from "node:http";

const server = http.createServer((_, res) => {
  res.writeHead(200);
  res.end("API online");
});

server.listen(3000, () => {
  console.log("API listening on :3000");
});
