const COOKIE_NAME = "vc_auth";
const DEFAULT_COOKIE_DAYS = 7;

export async function onRequest(context) {
  const { request, env } = context;

  if (!env.SITE_PASSWORD) {
    return context.next();
  }

  const url = new URL(request.url);

  if (url.pathname === "/api/login") {
    if (request.method === "POST") {
      return handleLogin(request, env);
    }

    return renderLoginPage({ redirectTo: "/" });
  }

  if (url.pathname === "/api/logout") {
    return logout();
  }

  const cookies = parseCookies(request.headers.get("Cookie") || "");
  const expectedToken = await makeToken(env.SITE_PASSWORD);

  if (cookies[COOKIE_NAME] === expectedToken) {
    return context.next();
  }

  if (url.pathname.startsWith("/api/")) {
    return json({ error: "请先输入网页访问密码。" }, 401);
  }

  return renderLoginPage({
    redirectTo: sanitizeRedirect(`${url.pathname}${url.search}`),
  });
}

async function handleLogin(request, env) {
  let password = "";
  let redirectTo = "/";

  const contentType = request.headers.get("Content-Type") || "";

  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => ({}));
    password = String(body.password || "");
    redirectTo = sanitizeRedirect(String(body.redirect || "/"));
  } else {
    const form = await request.formData();
    password = String(form.get("password") || "");
    redirectTo = sanitizeRedirect(String(form.get("redirect") || "/"));
  }

  if (!(await samePassword(password, env.SITE_PASSWORD))) {
    return renderLoginPage({
      error: "密码不正确，请重新输入。",
      redirectTo,
      status: 401,
    });
  }

  const token = await makeToken(env.SITE_PASSWORD);
  const maxAge = cookieMaxAge(env);

  return new Response(null, {
    status: 303,
    headers: {
      Location: redirectTo,
      "Set-Cookie": `${COOKIE_NAME}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`,
    },
  });
}

function logout() {
  return new Response(null, {
    status: 303,
    headers: {
      Location: "/",
      "Set-Cookie": `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
    },
  });
}

function renderLoginPage({ error = "", redirectTo = "/", status = 200 } = {}) {
  const errorHtml = error
    ? `<p class="error" role="alert">${escapeHtml(error)}</p>`
    : "";

  return new Response(
    `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>访问密码 | 声刻 Voice Clone</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #172033;
      background: linear-gradient(135deg, #edf7f3 0%, #f6f1ea 52%, #eef3fb 100%);
    }
    main {
      width: min(420px, calc(100vw - 32px));
      padding: 28px;
      border: 1px solid rgba(23, 32, 51, 0.12);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.9);
      box-shadow: 0 18px 60px rgba(23, 32, 51, 0.12);
    }
    h1 {
      margin: 0 0 10px;
      font-size: 24px;
      line-height: 1.25;
    }
    p {
      margin: 0 0 22px;
      color: #586174;
      line-height: 1.6;
    }
    label {
      display: block;
      margin-bottom: 8px;
      font-weight: 700;
    }
    input {
      width: 100%;
      min-height: 46px;
      padding: 10px 12px;
      border: 1px solid #c7cfda;
      border-radius: 6px;
      font-size: 16px;
      background: #fff;
    }
    button {
      width: 100%;
      min-height: 46px;
      margin-top: 14px;
      border: 0;
      border-radius: 6px;
      background: #176b5f;
      color: #fff;
      font-weight: 800;
      font-size: 16px;
      cursor: pointer;
    }
    button:hover { background: #13594f; }
    .error {
      margin: 0 0 14px;
      padding: 10px 12px;
      border-radius: 6px;
      color: #8a1f17;
      background: #fff0ee;
      border: 1px solid #ffc8c0;
    }
  </style>
</head>
<body>
  <main>
    <h1>请输入访问密码</h1>
    <p>密码正确后才能进入语音工具。</p>
    ${errorHtml}
    <form method="post" action="/api/login">
      <input type="hidden" name="redirect" value="${escapeHtml(redirectTo)}" />
      <label for="password">访问密码</label>
      <input id="password" name="password" type="password" autocomplete="current-password" autofocus required />
      <button type="submit">进入网页</button>
    </form>
  </main>
</body>
</html>`,
    {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    },
  );
}

async function samePassword(input, expected) {
  const inputHash = await sha256(input);
  const expectedHash = await sha256(expected);
  return inputHash === expectedHash;
}

async function makeToken(password) {
  return sha256(`voice-clone-cloudflare:${password}`);
}

async function sha256(value) {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function parseCookies(header) {
  return header.split(";").reduce((cookies, part) => {
    const index = part.indexOf("=");
    if (index === -1) return cookies;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) cookies[key] = value;
    return cookies;
  }, {});
}

function cookieMaxAge(env) {
  const days = Number(env.SITE_PASSWORD_COOKIE_DAYS || DEFAULT_COOKIE_DAYS);
  const safeDays = Number.isFinite(days) && days > 0 ? Math.min(days, 30) : DEFAULT_COOKIE_DAYS;
  return Math.round(safeDays * 24 * 60 * 60);
}

function sanitizeRedirect(value) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }

  return value;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
