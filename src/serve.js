import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { readState, statePath } from "./store.js";
import { buildView } from "./view.js";
import { performFetch, autoSourceIds } from "./refresh.js";

const WEB = fileURLToPath(new URL("./web/", import.meta.url));
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
};

function tokenOf(req, url) {
  const header = req.headers["x-quota-token"];
  if (typeof header === "string" && header) return header;
  return url.searchParams.get("token") ?? "";
}

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body, null, 2));
}

export function createAppServer({ token, port = 8787 }) {
  let fetching = null;

  const server = createServer(async (req, res) => {
    let url;
    try {
      url = new URL(req.url, "http://127.0.0.1");
    } catch {
      return json(res, 400, { ok: false, error: "bad_request" });
    }

    if (url.pathname === "/api/state") {
      if (req.method !== "GET") return json(res, 405, { ok: false, error: "method_not_allowed" });
      if (tokenOf(req, url) !== token) return json(res, 401, { ok: false, error: "unauthorized" });
      try {
        const { state } = readState();
        return json(res, 200, buildView(state));
      } catch (err) {
        return json(res, 500, {
          ok: false,
          error: "data_error",
          message:
            err.code === "UNKNOWN_VERSION"
              ? "数据版本较新，请升级 CLI"
              : err.code === "STALE_VERSION"
                ? "数据版本过旧，请运行 quota clear --yes"
                : `数据文件损坏：${statePath()}`,
          hint: "quota clear --yes（清空额度数据）",
        });
      }
    }

    if (url.pathname === "/api/refresh") {
      if (req.method !== "POST") return json(res, 405, { ok: false, error: "method_not_allowed" });
      if (tokenOf(req, url) !== token) return json(res, 401, { ok: false, error: "unauthorized" });
      if (fetching) return json(res, 409, { ok: false, error: "refresh_in_progress" });
      fetching = performFetch({ ids: autoSourceIds() })
        .then((result) => json(res, 200, result))
        .catch((err) => json(res, 500, { ok: false, error: "fetch_failed", message: String(err.message ?? err) }))
        .finally(() => {
          fetching = null;
        });
      return;
    }

    if (req.method !== "GET") {
      res.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
      return res.end("method not allowed");
    }

    const rel = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const file = normalize(join(WEB, rel));
    if (!file.startsWith(WEB)) {
      res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
      return res.end("forbidden");
    }
    try {
      let data = await readFile(file);
      if (rel === "index.html") {
        data = Buffer.from(
          data.toString("utf8").replaceAll("{{DATA_PATH}}", escapeHtml(statePath())).replaceAll("{{PORT}}", String(port)),
          "utf8"
        );
      }
      res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
      return res.end(data);
    } catch (err) {
      if (err?.code === "ENOENT") {
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        return res.end("not found");
      }
      throw err;
    }
  });

  server.on("clientError", (_err, socket) => socket.destroy());
  return server;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

export async function startServer({ port = 8787, host = "127.0.0.1", token } = {}) {
  const accessToken = token || randomBytes(16).toString("hex");
  const server = createAppServer({ token: accessToken, port });

  await new Promise((resolve, reject) => {
    const onError = (err) => {
      server.removeListener("listening", onListening);
      reject(err);
    };
    const onListening = () => {
      server.removeListener("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });

  const actualPort = server.address()?.port ?? port;
  console.log(`看板已启动：http://${host}:${actualPort}/?token=${accessToken}`);
  console.log("只监听本机回环；刷新由页面按钮或 quota fetch 触发。Ctrl+C 停止。");
  return { server, token: accessToken, port: actualPort, url: `http://${host}:${actualPort}/?token=${accessToken}` };
}
