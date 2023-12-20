#! /usr/bin/env node

import express from "express";
import { Command } from "commander";
import { WebSocketServer } from 'ws';
import { readdir, readFile } from "fs/promises";
import { cwd } from "process";
import path from "path";

const __dirname = cwd();
console.log("Running on:", __dirname);
//========================================================================================
/*                                                                                      *
 *                                         UTILS                                        *
 *                                                                                      */
//========================================================================================

function isNdFile(filename) {
  return filename.split(".nd").length > 1;
}

function getBaseHtml(title, script) {
  return `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
      <style>
          body {
            background: black;
            color: white;
            font-family: system-ui;
            margin: auto;
          }
      </style>
    </head>
    <body>
      
    </body>
    <script type="module">
        ${script}
      </script>   
  </html>
 `
}

function getPathFromURL(url) {
  return url;
}

//========================================================================================
/*                                                                                      *
 *                                        SERVER                                        *
 *                                                                                      */
//========================================================================================


class Server {
  constructor(httpActions, wsActions) {
    this.app = express();
    httpActions.forEach(({ path, regex, handler }) => {
      if (path) this.app.get(path, handler);
      if (regex) this.app.get(regex, handler);
    })
    this.path2WebSocketValues = wsActions.reduce(
      (map, { path, handler }) => {
        if (!path) return map;
        const wss = new WebSocketServer({ noServer: true });
        wss.on("connection", async (ws, _, request) => {
          console.log(`Websocket @${path} is connected, with request ${request.url}`);
          const onCloseSocket = await handler(ws, request);
          ws.on("close", () => {
            console.log(`Websocket @${path} is closed`);
            onCloseSocket();
          })
        })
        map[path] = { path, handler, wss };
        return map;
      }, {})

    this.regexWebSocketValues = wsActions.filter(({ regex }) => regex).map(({ regex, handler }) => {
      const wss = new WebSocketServer({ noServer: true });
      wss.on("connection", async (ws, _, request) => {
        console.log(`Websocket @${regex} regex is connected, with request ${request.url}`);
        const onCloseSocket = await handler(ws, request);
        ws.on("close", () => {
          console.log(`Websocket @${regex} is closed`);
          onCloseSocket();
        })
      })
      return { regex, handler, wss };
    })
    this.websocketUpgrade = server => server.on("upgrade", (request, socket, head) => {
      const pathname = getPathFromURL(request.url);
      if (pathname in this.path2WebSocketValues) {
        const { wss } = this.path2WebSocketValues[pathname];
        wss.handleUpgrade(request, socket, head, ws => {
          wss.emit("connection", ws, socket, request);
        })
      } else if (this.regexWebSocketValues.some(({ regex }) => pathname.match(regex))) {
        const { wss } = this.regexWebSocketValues.filter(({ regex }) => pathname.match(regex))[0];
        wss.handleUpgrade(request, socket, head, ws => {
          wss.emit("connection", ws, socket, request);
        })
      } else {
        socket.destroy();
      }
    })
  }

  start(port) {
    const server = this.app.listen(port, () => {
      console.log(`Server is running on http://localhost:${port}`);
    });
    this.websocketUpgrade(server);
  }

  static builder() {
    return new ServerBuilder();
  }
}

class ServerBuilder {
  constructor() {
    this._httpActions = [];
    this._wsActions = [];
  }

  httpAction(action) {
    this._httpActions.push(action);
    return this;
  }

  wsAction(action) {
    this._wsActions.push(action);
    return this;
  }

  build() {
    return new Server(this._httpActions, this._wsActions);
  }

}


//========================================================================================
/*                                                                                      *
 *                                    SERVER ACTIONS                                    *
 *                                                                                      */
//========================================================================================


async function serveListOfFiles(_, res) {
  res.send(
    getBaseHtml(
      "List of Nabladown files",
      `
      const ws = new WebSocket(\`ws://\${window.location.host}\`);
      ws.addEventListener('open', event => {
        console.log('Connected to the WebSocket server');
        
        ws.addEventListener('message', async event => {
          console.log("Got message", event.data);
          const files = event.data.split(",");
          document.body.innerHTML = \`
          <ul>
            \${files.map(file => \`<li><a href="\${file}">\${file}</a></li>\`).join("\\n")}
          </ul>
          \`;
        });
        
        ws.addEventListener('close', event => {
          console.log('Disconnected from the WebSocket server');
        });
      });
      `
    ));
}

function serveNdFile(req, res) {
  const fileName = req.url;
  res.send(getBaseHtml(
    fileName,
    `
      import { parse, render } from "https://cdn.jsdelivr.net/npm/nabladown.js/dist/web/index.js";
      const ws = new WebSocket(\`ws://\${window.location.host}\${window.location.pathname}\`);
      ws.addEventListener('open', event => {
        console.log('Connected to the WebSocket server');
        
        ws.addEventListener('message', async event => {
          console.log("Got message", event.data);
          const body = document.body;
          while (body.firstChild) {
            body.removeChild(body.firstChild);
          }
          body.appendChild(
            await render(
              parse(event.data)
            )
          );
        });
        
        ws.addEventListener('close', event => {
          console.log('Disconnected from the WebSocket server');
        });
      });
      `
  ))
}

const hotReloadListOfFiles = async ws => {
  const reloadList = async () => (await readdir(path.join(__dirname, "/"))).filter(isNdFile).sort();

  // first render
  let files = await reloadList();
  ws.send(files);

  // hot reloading, node-watch not working
  const id = setInterval(async () => {
    const newFiles = await reloadList();
    if (
      newFiles.length !== files.length ||
      newFiles.map((f, i) => f === files[i]).some(x => !x)
    ) {
      console.log("Files changed", newFiles);
      files = newFiles;
      ws.send(files);
    }
  }, 100);

  return () => clearInterval(id);
}

const hotReloadFile = async (ws, request) => {
  let fileName = request.url.split("/").at(-1);
  if (!fileName) return;
  fileName = decodeURI(fileName);

  const reloadFile = () => readFile(path.join(__dirname, "/" + fileName), { encoding: "utf8" });

  // first render
  let fileContent = await reloadFile();
  ws.send(fileContent);

  // hot reloading
  const id = setInterval(async () => {
    const newFileContent = await reloadFile();
    if (newFileContent !== fileContent) {
      fileContent = newFileContent;
      ws.send(fileContent);
    }
  }, 100)
  return () => clearInterval(id);
}

//========================================================================================
/*                                                                                      *
 *                                         MAIN                                         *
 *                                                                                      */
//========================================================================================

const program = new Command();
program
  .name('nabladown-server')
  .description('Serving nabladown(.nd) files rendered with hot reload')
  .version('1.0.0');
program.option("-p, --port <number>", "port number", 3000)
  .action(({ port }) => {
    Server.builder()
      .httpAction({ path: "/", handler: serveListOfFiles })
      .wsAction({ path: "/", handler: hotReloadListOfFiles })
      .httpAction({ regex: /.*\.nd$/, handler: serveNdFile })
      .wsAction({ regex: /.*\.nd$/, handler: hotReloadFile })
      .build()
      .start(port)
  })
program.parse();
