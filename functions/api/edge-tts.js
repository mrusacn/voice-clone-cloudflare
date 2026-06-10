const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const EDGE_TTS_HOST = "speech.platform.bing.com";
const DEFAULT_FORMAT = "audio-24khz-48kbitrate-mono-mp3";
const MAX_TEXT_LENGTH = 5000;

export async function onRequestPost(context) {
  const { request, env } = context;

  if (env.EDGE_TTS_API_KEY) {
    const header = request.headers.get("authorization") || "";
    if (header !== `Bearer ${env.EDGE_TTS_API_KEY}`) {
      return jsonError("Edge TTS API Key 不正确。", 401);
    }
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("请提交 JSON 请求。", 400);
  }

  const text = normalizeText(body.input || body.text);
  if (!text) {
    return jsonError("请输入要朗读的文本。", 400);
  }

  if (text.length > MAX_TEXT_LENGTH) {
    return jsonError(`文本太长，请控制在 ${MAX_TEXT_LENGTH} 字以内。`, 400);
  }

  const voice = String(body.voice || env.EDGE_TTS_VOICE || "zh-CN-XiaoxiaoNeural");
  const speed = clampNumber(body.speed, 1, 0.25, 2);
  const pitch = clampNumber(body.pitch, 1, 0.5, 2);

  try {
    const audioBytes = await synthesizeEdgeSpeech({
      text,
      voice,
      speed,
      pitch,
      outputFormat: String(body.outputFormat || DEFAULT_FORMAT)
    });

    return new Response(audioBytes, {
      headers: {
        "content-type": "audio/mpeg",
        "cache-control": "no-store",
        ...corsHeaders()
      }
    });
  } catch (error) {
    return jsonError(error.message || "Edge TTS 生成失败。", error.status || 502);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: corsHeaders()
  });
}

async function synthesizeEdgeSpeech(options) {
  const requestId = randomHex(16);
  const url = `wss://${EDGE_TTS_HOST}/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&ConnectionId=${requestId}`;
  const socket = new WebSocket(url);
  const opened = waitForOpen(socket, 8000);
  await opened;

  socket.send(makeSpeechConfig(options.outputFormat));
  socket.send(makeSsmlRequest(requestId, options));

  const chunks = [];
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      tryClose(socket);
      reject(new ProviderError("Edge TTS 等待超时。", 504));
    }, 45000);

    socket.addEventListener("message", (event) => {
      if (typeof event.data === "string") {
        if (event.data.includes("Path:turn.end")) {
          clearTimeout(timeout);
          tryClose(socket);
          resolve();
        }
        return;
      }

      const chunk = extractAudioChunk(event.data);
      if (chunk?.length) {
        chunks.push(chunk);
      }
    });

    socket.addEventListener("error", () => {
      clearTimeout(timeout);
      reject(new ProviderError("Edge TTS WebSocket 连接失败。", 502));
    });

    socket.addEventListener("close", () => {
      if (chunks.length) {
        clearTimeout(timeout);
        resolve();
      }
    });
  });

  if (!chunks.length) {
    throw new ProviderError("Edge TTS 没有返回音频。", 502);
  }

  return concatBytes(chunks);
}

function waitForOpen(socket, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      tryClose(socket);
      reject(new ProviderError("Edge TTS 连接超时。", 504));
    }, timeoutMs);

    socket.addEventListener("open", () => {
      clearTimeout(timeout);
      resolve();
    });

    socket.addEventListener("error", () => {
      clearTimeout(timeout);
      reject(new ProviderError("Edge TTS WebSocket 连接失败。", 502));
    });
  });
}

function makeSpeechConfig(outputFormat) {
  return [
    `X-Timestamp:${new Date().toISOString()}`,
    "Content-Type:application/json; charset=utf-8",
    "Path:speech.config",
    "",
    JSON.stringify({
      context: {
        synthesis: {
          audio: {
            metadataoptions: {
              sentenceBoundaryEnabled: false,
              wordBoundaryEnabled: false
            },
            outputFormat
          }
        }
      }
    })
  ].join("\r\n");
}

function makeSsmlRequest(requestId, options) {
  const rate = percent(options.speed - 1);
  const pitch = percent((options.pitch - 1) / 2);
  const locale = voiceLocale(options.voice);
  const ssml = [
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${locale}">`,
    `<voice name="${escapeXml(options.voice)}">`,
    `<prosody rate="${rate}" pitch="${pitch}">${escapeXml(options.text)}</prosody>`,
    "</voice>",
    "</speak>"
  ].join("");

  return [
    `X-RequestId:${requestId}`,
    `X-Timestamp:${new Date().toISOString()}`,
    "Content-Type:application/ssml+xml",
    "Path:ssml",
    "",
    ssml
  ].join("\r\n");
}

function extractAudioChunk(data) {
  if (data instanceof ArrayBuffer) {
    return parseBinaryFrame(new Uint8Array(data));
  }

  if (data instanceof Blob) {
    return null;
  }

  return parseBinaryFrame(new Uint8Array(data));
}

function parseBinaryFrame(bytes) {
  if (bytes.length < 2) {
    return null;
  }

  const headerLength = (bytes[0] << 8) + bytes[1];
  const payloadOffset = 2 + headerLength;
  if (payloadOffset >= bytes.length) {
    return null;
  }

  const header = new TextDecoder().decode(bytes.slice(2, payloadOffset));
  if (!header.includes("Path:audio")) {
    return null;
  }

  return bytes.slice(payloadOffset);
}

function concatBytes(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function voiceLocale(voice) {
  const match = String(voice).match(/^([a-z]{2}-[A-Z]{2})-/);
  return match ? match[1] : "zh-CN";
}

function percent(value) {
  const rounded = Math.round(value * 100);
  return `${rounded >= 0 ? "+" : ""}${rounded}%`;
}

function randomHex(bytes) {
  const values = new Uint8Array(bytes);
  crypto.getRandomValues(values);
  return Array.from(values).map((value) => value.toString(16).padStart(2, "0")).join("");
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, number));
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function tryClose(socket) {
  try {
    socket.close();
  } catch {
    // Ignore close failures.
  }
}

function jsonError(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...corsHeaders()
    }
  });
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "authorization, content-type"
  };
}

class ProviderError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
  }
}
