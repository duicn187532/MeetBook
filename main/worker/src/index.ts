// MeetBook 後端（Cloudflare Workers）
// 目前只是骨架：API、管理後台與 LINE webhook 在下一個 PR 加入。這個檔案還不會被部署。

export interface Env {
  DB: D1Database;
  ENV: string;
  LOG_LEVEL: string;
}

export default {
  fetch(request: Request): Response {
    const { pathname } = new URL(request.url);
    if (request.method === "GET" && pathname === "/") return Response.json({ ok: true });
    return new Response("Not Found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
