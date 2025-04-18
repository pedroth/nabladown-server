#! /usr/bin/env node

import express from "express";
import { Command } from "commander";
import { WebSocketServer } from 'ws';
import { readFile } from "fs/promises";
import { readdirSync, readFileSync, writeFileSync } from "fs";
import { cwd } from "process";
import { normalize, join } from "path";

const __dirname = cwd();
console.log("Running on:", __dirname);
//========================================================================================
/*                                                                                      *
 *                                         UTILS                                        *
 *                                                                                      */
//========================================================================================

function isNdFile(fileObj) {
  if (fileObj.children.length === 0) return fileObj.name.includes(".nd");
  return fileObj.children.some(isNdFile);
}

function filterNdFiles(fileObjs) {
  return fileObjs
    .filter(isNdFile)
    .map(f => {
      if (f.children.length > 0) {
        f.children = filterNdFiles(f.children);
      }
      return f;
    })
}

function readFilesNames(dir = "/", level = 3) {
  if (level === 0) return [];
  return readdirSync(join(__dirname, dir), { withFileTypes: true })
    .filter(f => !f.name.match(/^\..*/))
    .map(f => {
      return {
        src: dir + f.name,
        name: f.name,
        children: !f.isDirectory() ?
          [] :
          readFilesNames(dir + f.name + "/", level - 1)
      };
    });
}

function areFoldersEqual(foldersA, foldersB) {
  if (foldersA.length !== foldersB.length) return false;
  for (let i = 0; i < foldersA.length; i++) {
    if (foldersA[i].src !== foldersB[i].src) return false;
    if (!areFoldersEqual(foldersA[i].children, foldersB[i].children)) return false;
  }
  return true;
}

function debounce(lambda, debounceTimeInMillis = 500) {
  let timerId;
  return function (...vars) {
    if (timerId) {
      clearTimeout(timerId);
    }
    timerId = setTimeout(() => {
      lambda(...vars);
    }, debounceTimeInMillis);
    return true;
  };
}

const light_mode_svg = `
<svg 
    width="24"
    height="24"
    fill="currentColor" 
    viewBox="0 -960 960 960"
    xmlns="http://www.w3.org/2000/svg"
><path 
        d="M480-360q50 0 85-35t35-85q0-50-35-85t-85-35q-50 0-85 35t-35 85q0 50 35 85t85 35Zm0 80q-83 0-141.5-58.5T280-480q0-83 58.5-141.5T480-680q83 0 141.5 58.5T680-480q0 83-58.5 141.5T480-280ZM80-440q-17 0-28.5-11.5T40-480q0-17 11.5-28.5T80-520h80q17 0 28.5 11.5T200-480q0 17-11.5 28.5T160-440H80Zm720 0q-17 0-28.5-11.5T760-480q0-17 11.5-28.5T800-520h80q17 0 28.5 11.5T920-480q0 17-11.5 28.5T880-440h-80ZM480-760q-17 0-28.5-11.5T440-800v-80q0-17 11.5-28.5T480-920q17 0 28.5 11.5T520-880v80q0 17-11.5 28.5T480-760Zm0 720q-17 0-28.5-11.5T440-80v-80q0-17 11.5-28.5T480-200q17 0 28.5 11.5T520-160v80q0 17-11.5 28.5T480-40ZM226-678l-43-42q-12-11-11.5-28t11.5-29q12-12 29-12t28 12l42 43q11 12 11 28t-11 28q-11 12-27.5 11.5T226-678Zm494 495-42-43q-11-12-11-28.5t11-27.5q11-12 27.5-11.5T734-282l43 42q12 11 11.5 28T777-183q-12 12-29 12t-28-12Zm-42-495q-12-11-11.5-27.5T678-734l42-43q11-12 28-11.5t29 11.5q12 12 12 29t-12 28l-43 42q-12 11-28 11t-28-11ZM183-183q-12-12-12-29t12-28l43-42q12-11 28.5-11t27.5 11q12 11 11.5 27.5T282-226l-42 43q-11 12-28 11.5T183-183Zm297-297Z"
    /></svg>
`;

const dark_mode_svg = `
<svg 
width="24"
height="24" 
fill="currentColor" 
viewBox="0 -960 960 960" 
xmlns="http://www.w3.org/2000/svg"
><path 
    d="M480-120q-150 0-255-105T120-480q0-150 105-255t255-105q14 0 27.5 1t26.5 3q-41 29-65.5 75.5T444-660q0 90 63 153t153 63q55 0 101-24.5t75-65.5q2 13 3 26.5t1 27.5q0 150-105 255T480-120Zm0-80q88 0 158-48.5T740-375q-20 5-40 8t-40 3q-123 0-209.5-86.5T364-660q0-20 3-40t8-40q-78 32-126.5 102T200-480q0 116 82 198t198 82Zm-10-270Z"
/></svg>
`;


const edit_mode_svg = `
<svg 
width="24"
height="24" 
fill="currentColor" 
viewBox="0 0 512 512"
xmlns="http://www.w3.org/2000/svg"
>
 <!--!Font Awesome Free 6.5.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2024 Fonticons, Inc.-->
 <path 
    d="M362.7 19.3L314.3 67.7 444.3 197.7l48.4-48.4c25-25 25-65.5 0-90.5L453.3 19.3c-25-25-65.5-25-90.5 0zm-71 71L58.6 323.5c-10.4 10.4-18 23.3-22.2 37.4L1 481.2C-1.5 489.7 .8 498.8 7 505s15.3 8.5 23.7 6.1l120.3-35.4c14.1-4.2 27-11.8 37.4-22.2L421.7 220.3 291.7 90.3z"
/></svg>
`

const no_edit_svg = `
<svg 
width="24"
height="24" 
fill="currentColor"
xmlns="http://www.w3.org/2000/svg" 
viewBox="0 0 384 512"
>
  <!--!Font Awesome Free 6.5.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2024 Fonticons, Inc.-->
  <path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"
/></svg>
`

const worker_code = `
import { parse } from "https://cdn.jsdelivr.net/npm/nabladown.js/dist/web/index.js";

self.onmessage = function(e) {
  console.log("Got message from main", e.data)
  const input = e.data;
  const parsed = parse(input);
  self.postMessage(parsed);
};
`

function getBaseHtml(title, script) {
  return `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
      <style>
          :root {
            --background-color: rgb(24, 24, 24);
            --text-color: rgba(255, 255, 255, 0.9);
            --link-color: rgba(31, 111, 235, 1);
            --fast-transition: 0.3s;
            --faster-transition: 0.1s;
          }

          html {
            height: 100vh;
            width: 100vw;
          }
    
          body {
            background-color: var(--background-color);
            color: var(--text-color);
            font-size: 1.25rem;
            font-weight: 400;
            overflow-x: hidden;
            /* transition: all var(--fast-transition) ease-in-out; */
            font-family: sans-serif;
          }

          a:link {
            color: var(--link-color);
          }

          article {
            padding-bottom: 50px;
            padding-left: 1rem;
          }

          .button {
            max-width: fit-content;
          }

          .button svg {
            cursor: pointer;
            width: 1.6rem;
            opacity: 0.3;
            transition: all var(--faster-transition) ease-in-out;
          }

          .button svg:hover {
            transform: rotate(23deg);
            opacity: 0.9;
          }

          #root {
            opacity: 1;
            transition: opacity var(--fast-transition) ease-in-out;
            margin-left: auto;
            margin-right: auto;
            height: 100%;
            max-width: 1080px;
            min-width: 333px;
          }

          header {
            margin-top: 1rem;
            position: fixed;
            top: 0;
          }

          .loading-spinner {
            border: 4px solid #444;
            border-top: 4px solid #f0f0f0;
            border-radius: 50%;
            width: 24px;
            height: 24px;
            animation: spin 1s linear infinite;
          }

          .loading-container {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 100%;
            height: 100%;
          }

          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }

          /* to put icon on right side just add flex to header, flex-grow and text-align: end to button class */
      </style>
      <style>
      ${(() => {
      try {
        if (program.opts().css) {
          return readFileSync(join(__dirname, "./index.css"), { encoding: "utf8" })
        }
      } catch (e) {
        return "";
      }
    })()}
      </style>
    </head>
    <body>
      <header id="header"></header>
      <div id="root">
      </div>
    </body>
    <script>

     ${LOCAL_STORAGE}

     const light_mode_svg = \`${light_mode_svg}\`;
     const dark_mode_svg = \`${dark_mode_svg}\`;

     function addThemeButton(ls) {
      let theme = ls.getItem("theme") || "dark";
      const container = document.getElementById("header");
      const button = document.createElement("div");
      button.classList.add("button");

      const updateTheme = theme => {
        const isDark = theme === "dark";
        button.innerHTML = isDark ? light_mode_svg : dark_mode_svg;
        if (isDark) {
          document.documentElement.style.setProperty("--background-color", "rgb(24,24,24)");
          document.documentElement.style.setProperty("--text-color", "rgba(255,255,255,0.9)");
        } else {
          document.documentElement.style.setProperty("--background-color", "rgb(255,255,255)");
          document.documentElement.style.setProperty("--text-color", "rgba(24,24,24,0.9)");
        }
      }

      // set up theme first time
      updateTheme(theme);
      // add click event
      button.addEventListener("click", _ => {
        theme = theme === "dark" ? "light" : "dark";
        updateTheme(theme);
        ls.setItem("theme", theme);
      })
      container.appendChild(button);
    }

     addThemeButton(NablaLocalStorage);
    </script>
    <script type="module">
        ${script}
    </script>
  </html>
 `
}

const LOCAL_STORAGE = `
  const NablaLocalStorage = (() => {
    const namespace = "nabladown-server";
    return {
      getItem: key => {
        const ls = localStorage.getItem(namespace) || "{}";
        return JSON.parse(ls)[key];
      },
      setItem: (key, value) => {
        const ls = JSON.parse(localStorage.getItem(namespace)) || {};
        ls[key] = value;
        localStorage.setItem(namespace, JSON.stringify(ls));
        return this;
      }
    };
  })();
`;

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
      ${LOCAL_STORAGE}
      const detailsIds = [];
      function createFoldersList(filesStruct, level=0) {
        const html = \`
        \${
          filesStruct
          .map(file => {
            if(file.children.length > 0) detailsIds.push(file.name);
            return file.children.length === 0 ? 
            \`<li><a href="\${file.src}">\${file.name}</a></li>\` :
            \`<details id="details_\${file.name}"><summary>\${file.name}</summary><ul>\${createFoldersList(file.children, level + 1)}</ul></details>\`;
          })
          .join("\\n")
          }
        \`;
        // maintain state
        setTimeout(() => {
          if(level === 0) {
            detailsIds.forEach(id => {
              const details = document.getElementById(\`details_\${id}\`);
              const storageDetailState = NablaLocalStorage.getItem(\`details_\${id}\`);
              if(storageDetailState) details.open = storageDetailState;
              details.addEventListener('click', (e) => {
                if(event.target.tagName !== 'SUMMARY') return;
                const isOpen = details.open;
                NablaLocalStorage.setItem(\`details_\${id}\`, !isOpen);
              })
            });
          }
        })
        return html;
      }

      const ws = new WebSocket(\`ws://\${window.location.host}\`);
      ws.addEventListener('open', event => {
        console.log('Connected to the WebSocket server');
        
        ws.addEventListener('message', async event => {
          console.log("Got message", event.data);
          const filesStruct = JSON.parse(event.data);
          document.getElementById("root").innerHTML = \`
          <h2> Nabladown files in <i>${__dirname}</i> </h2>
          \${createFoldersList(filesStruct)}
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
  let debounceString = debounce.toString();
  if (!debounceString.includes("function debounce"))
    debounceString = debounceString.replace("function", "function debounce");
  res.send(getBaseHtml(
    fileName,
    `
      import { render } from "https://cdn.jsdelivr.net/npm/nabladown.js/dist/web/index.js";
      
      const edit_mode_svg = \`${edit_mode_svg}\`;
      const no_edit_svg = \`${no_edit_svg}\`;
      
      let isEditable = false;
      let nablaDoc = "";

      ${LOCAL_STORAGE}

      ${debounceString}

      //---- WORKER

      const workerCode = \`${worker_code}\`

      const blob = new Blob([workerCode], { type: 'application/javascript' });
      const worker = new Worker(URL.createObjectURL(blob), {type: "module"});
      worker.onmessage = async function(e) {
       console.log("Got message from worker", e.data);
       const root = document.getElementById("root");
       while (root.firstChild) {
          root.removeChild(root.firstChild);
       }
       root.appendChild(await render(e.data));
      };

      //----
            
      document.addEventListener("scroll", e => {
        NablaLocalStorage.setItem("scroll", document.documentElement.scrollTop);
      });

      async function renderNabla(doc) {
        const root = document.getElementById("root");
        while (root.firstChild) {
          root.removeChild(root.firstChild);
        }
        worker.postMessage(doc);
        root.innerHTML = '<div class="loading-container"><div class="loading-spinner"></div></div>'
      }
      
      const ws = new WebSocket(\`ws://\${window.location.host}\${window.location.pathname}\`);
      ws.addEventListener('open', event => {
        console.log('Connected to the WebSocket server');
        
        ws.addEventListener('message', async event => {
          const previousScroll = NablaLocalStorage.getItem("scroll");
          console.log("Got message", event.data);
          nablaDoc = event.data;
          if(isEditable) return;
          await renderNabla(event.data);
          document.documentElement.scrollTop = previousScroll
        });
        
        ws.addEventListener('close', event => {
          console.log('Disconnected from the WebSocket server');
        });
      });


      function addEditButton() {
        const container = document.getElementById("header");
        const button = document.createElement("div");
        button.classList.add("button");

        const updateEditMode = async () => {
          button.innerHTML = !isEditable ? edit_mode_svg : no_edit_svg;
          button.title = isEditable ? "Shift+Enter to submit" : "Press E to edit";
          const article = document.getElementsByTagName("article")[0];
          if(article) {
            if(isEditable) {
              article.innerText = nablaDoc; // Preserve original whitespace
              article.style.whiteSpace = 'pre-wrap'; // Preserve whitespace in display
              article.setAttribute("contenteditable", true);
              article.addEventListener('input', debounce(() => {
                ws.send(document.getElementsByTagName("article")[0].innerText);
              }));
              article.addEventListener('keydown', function(event) {
                if (event.key === 'Tab') {
                  event.preventDefault();
                  const selection = window.getSelection();
                  const range = selection.getRangeAt(0);
                  const tabNode = document.createTextNode('\t');
                  range.insertNode(tabNode);
                  range.setStartAfter(tabNode);
                  range.setEndAfter(tabNode);
                  selection.removeAllRanges();
                  selection.addRange(range);
                  ws.send(article.innerText);
                }
                if (event.key === 'Enter' && event.shiftKey) {
                    isEditable = !isEditable;
                    updateEditMode();
                }
              });
              article.focus();
            } else {
             const previousScroll = NablaLocalStorage.getItem("scroll");
             await renderNabla(nablaDoc);
             document.documentElement.scrollTop = previousScroll
            }
          }

          window.addEventListener('keydown', () => {
            if (
              !isEditable &&
              event.key === 'e'
            ) {
                isEditable = !isEditable;
                setTimeout(() => updateEditMode(), 100);
            }
          })
        }

        updateEditMode();
        // add click event
        button.addEventListener("click", _ => {
          isEditable = !isEditable;
          updateEditMode();
        })
        container.appendChild(button);
      }

      addEditButton();
      `
  ))
}

async function serveStatic(req, res) {
  try {
    // Normalize and ensure the resolved path stays inside __dirname
    const rawPath = decodeURIComponent(req.url);
    const fullPath = normalize(join(__dirname, rawPath));
    if (!fullPath.startsWith(__dirname)) {
      return res.sendStatus(403);
    }
    const file = await readFile(fullPath);
    res.send(file);
  } catch (error) {
    console.error("serveStatic error:", error);
    res.sendStatus(404);
  }
}

const HOT_RELOAD_INTERVAL = 500;
const hotReloadListOfFiles = async ws => {
  const reloadList = async (dir = "/") => filterNdFiles(readFilesNames(dir)
    .sort((a, b) => {
      const aName = (a.name || a).toLowerCase();
      const bName = (b.name || b).toLowerCase();
      return aName < bName ? -1 : aName > bName ? 1 : 0;
    }))

  // first render
  let files = await reloadList();

  Promise.all(files).then(fs => {
    ws.send(JSON.stringify(fs));
  })

  // hot reloading, node-watch not working
  const id = setInterval(async () => {
    const newFiles = await reloadList();
    if (!areFoldersEqual(files, newFiles)) {
      console.log("Files changed", newFiles);
      files = newFiles;
      ws.send(JSON.stringify(files));
    }
  }, HOT_RELOAD_INTERVAL);

  return () => clearInterval(id);
}

const hotReloadFile = async (ws, request) => {
  let fileName = request.url;
  if (!fileName) return;
  fileName = decodeURI(fileName);

  const filePath = join(__dirname, fileName);
  const reloadFile = async () => {
    try{
      return await readFile(filePath, { encoding: "utf8" });
    } catch(e) {
      return `# File \`${filePath}\` not found!\n`
    }
  }

  // first render
  let fileContent = await reloadFile();
  ws.send(fileContent);

  // receive edits
  ws.on("message", (data) => {
    const fileChanged = data.toString();
    writeFileSync(filePath, fileChanged);
  })

  // hot reloading
  const id = setInterval(async () => {
    const newFileContent = await reloadFile();
    if (newFileContent !== fileContent) {
      fileContent = newFileContent;
      ws.send(fileContent);
    }
  }, HOT_RELOAD_INTERVAL)
  return () => clearInterval(id);
}

//========================================================================================
/*                                                                                      *
 *                                         MAIN                                         *
 *                                                                                      */
//========================================================================================

const MEDIA_FILES_REGEX = /.*\.(png|jpg|jpeg|webp|gif|svg|bmp|tiff|tif|mp4|webm|ogv|ogg)$/
const WEB_FILES_REGEX = /.*\.(js)$/


const program = new Command();
program
  .name('nabladown-server')
  .description('Serving nabladown(.nd) files rendered with hot reload')
  .version('1.0.51');
program.option("-p, --port <number>", "port number", 3000)
program.option('-no-css, --no-css', 'Disable local index.css', true) // commader negate var syntax
  .action(({ port }) => {
    Server.builder()
      .httpAction({ path: "/", handler: serveListOfFiles })
      .wsAction({ path: "/", handler: hotReloadListOfFiles })
      .httpAction({ regex: /.*\.nd$/, handler: serveNdFile })
      .wsAction({ regex: /.*\.nd$/, handler: hotReloadFile })
      .httpAction({ regex: MEDIA_FILES_REGEX, handler: serveStatic })
      .httpAction({ regex: WEB_FILES_REGEX, handler: serveStatic })
      .build()
      .start(port)
  })
program.parse(process.argv);
