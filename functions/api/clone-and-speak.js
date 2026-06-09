const MAX_TEXT_LENGTH = 5000;
const MAX_AUDIO_BYTES = 12 * 1024 * 1024;
const ALLOWED_AUDIO_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/webm",
  "audio/mp4",
  "audio/m4a",
  "audio/aac",
  "audio/ogg"
]);

export async function onRequestPost(context) {
  const { request, env } = context;

  let form;
  try {
    form = await request.formData();
  } catch {
    return jsonError("请使用 multipart/form-data 提交音频和文本。", 400);
  }

  const consent = form.get("consent") === "true";
  const provider = normalizeProvider(form.get("provider"));
  if (!consent) {
    return jsonError("生成前必须确认已获得该声音的合法授权。", 403);
  }

  const sample = form.get("sample");
  const text = normalizeText(form.get("text"));
  const voiceName = normalizeName(form.get("voiceName"));

  if (!text) {
    return jsonError("请输入要朗读的文本。", 400);
  }

  if (text.length > MAX_TEXT_LENGTH) {
    return jsonError(`文本太长，请控制在 ${MAX_TEXT_LENGTH} 字以内。`, 400);
  }

  if ((provider === "elevenlabs" || provider === "elevenlabs_tts") && !env.ELEVENLABS_API_KEY) {
    return jsonError("服务端还没有配置 ELEVENLABS_API_KEY。", 500);
  }

  if ((provider === "elevenlabs" || provider === "custom") && !(sample instanceof File)) {
    return jsonError("这个模式需要上传一段音频样本。", 400);
  }

  if (sample instanceof File) {
    if (!isAllowedAudio(sample)) {
      return jsonError("音频格式暂不支持，请上传 wav、mp3、m4a、webm、ogg 或 aac。", 400);
    }

    if (sample.size > MAX_AUDIO_BYTES) {
      return jsonError("音频文件过大，请控制在 12MB 以内。", 400);
    }
  }

  try {
    if (provider === "azure") {
      return await azureTextToSpeech(env, form, text);
    }

    if (provider === "elevenlabs_tts") {
      return await elevenLabsPresetTextToSpeech(env, form, text);
    }

    if (provider === "google") {
      return await googleTextToSpeech(env, form, text);
    }

    if (provider === "oneforall") {
      return await oneForAllTextToSpeech(env, form, text);
    }

    if (provider === "custom") {
      return await customTextToSpeech(env, form, text, sample, voiceName);
    }
  } catch (error) {
    const message = error instanceof ProviderError
      ? error.message
      : "生成失败，请检查 API 配置。";
    return jsonError(message, error.status || 502);
  }

  const modelId = normalizeModelId(form.get("modelId") || env.ELEVENLABS_MODEL_ID);
  let voiceId;
  try {
    voiceId = await createTemporaryVoice(env.ELEVENLABS_API_KEY, sample, voiceName);
    const audio = await synthesizeSpeech(env.ELEVENLABS_API_KEY, voiceId, {
      text,
      modelId,
      stability: readNumber(form.get("stability"), 0.45, 0, 1),
      similarityBoost: readNumber(form.get("similarityBoost"), 0.8, 0, 1),
      style: readNumber(form.get("style"), 0.1, 0, 1)
    });

    cleanupVoice(context, env, voiceId);

    return new Response(audio.body, {
      headers: {
        "content-type": audio.contentType,
        "cache-control": "no-store",
        "x-voice-id": voiceId,
        ...corsHeaders()
      }
    });
  } catch (error) {
    if (voiceId) {
      cleanupVoice(context, env, voiceId);
    }

    const message = error instanceof ProviderError
      ? error.message
      : "生成失败，请稍后再试。";

    return jsonError(message, error.status || 502);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: corsHeaders()
  });
}

async function createTemporaryVoice(apiKey, file, voiceName) {
  const body = new FormData();
  body.append("name", voiceName);
  body.append("description", "Temporary voice clone generated from the Cloudflare Pages demo.");
  body.append("files", file, file.name || "sample.wav");

  const response = await fetch("https://api.elevenlabs.io/v1/voices/add", {
    method: "POST",
    headers: {
      "xi-api-key": apiKey
    },
    body
  });

  const data = await readProviderResponse(response);
  if (!response.ok) {
    throw new ProviderError(providerMessage(data, "创建克隆声音失败。"), response.status);
  }

  const voiceId = data.voice_id || data.voiceId;
  if (!voiceId) {
    throw new ProviderError("语音服务没有返回 voice_id。", 502);
  }

  return voiceId;
}

async function synthesizeSpeech(apiKey, voiceId, options) {
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "content-type": "application/json",
      "accept": "audio/mpeg"
    },
    body: JSON.stringify({
      text: options.text,
      model_id: options.modelId,
      voice_settings: {
        stability: options.stability,
        similarity_boost: options.similarityBoost,
        style: options.style,
        use_speaker_boost: true
      }
    })
  });

  if (!response.ok) {
    const data = await readProviderResponse(response);
    throw new ProviderError(providerMessage(data, "文本转语音失败。"), response.status);
  }

  return {
    body: response.body,
    contentType: response.headers.get("content-type") || "audio/mpeg"
  };
}

function cleanupVoice(context, env, voiceId) {
  if (env.DELETE_TEMP_VOICE === "false") {
    return;
  }

  const task = fetch(`https://api.elevenlabs.io/v1/voices/${encodeURIComponent(voiceId)}`, {
    method: "DELETE",
    headers: {
      "xi-api-key": env.ELEVENLABS_API_KEY
    }
  }).catch(() => undefined);

  if (typeof context.waitUntil === "function") {
    context.waitUntil(task);
  } else {
    void task;
  }
}

async function azureTextToSpeech(env, form, text) {
  const key = form.get("azureKey") || env.AZURE_SPEECH_KEY;
  const region = form.get("azureRegion") || env.AZURE_SPEECH_REGION;
  const voice = form.get("azureVoice") || env.AZURE_SPEECH_VOICE || "zh-CN-XiaoxiaoNeural";

  if (!key || !region) {
    return jsonError("Azure 模式需要配置 AZURE_SPEECH_KEY 和 AZURE_SPEECH_REGION，或在页面中填写。", 500);
  }

  const ssml = [
    '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN">',
    `<voice name="${escapeXml(String(voice))}">${escapeXml(text)}</voice>`,
    "</speak>"
  ].join("");

  const response = await fetch(`https://${encodeURIComponent(String(region))}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": String(key),
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3",
      "User-Agent": "voice-clone-cloudflare"
    },
    body: ssml
  });

  if (!response.ok) {
    const detail = await response.text();
    return jsonError(detail || "Azure 语音生成失败。", response.status);
  }

  return audioResponse(response);
}

async function googleTextToSpeech(env, form, text) {
  const serviceAccountText = form.get("googleServiceAccount") || env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountText) {
    return jsonError("Google 模式需要配置 GOOGLE_SERVICE_ACCOUNT_JSON，或在页面中填写服务账号 JSON。", 500);
  }

  const account = parseServiceAccount(serviceAccountText);
  const accessToken = await getGoogleAccessToken(account);
  const voiceName = form.get("googleVoice") || env.GOOGLE_TTS_VOICE || "cmn-CN-Standard-A";
  const languageCode = form.get("googleLanguage") || env.GOOGLE_TTS_LANGUAGE || "cmn-CN";

  const response = await fetch("https://texttospeech.googleapis.com/v1/text:synthesize", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      input: { text },
      voice: {
        languageCode,
        name: voiceName
      },
      audioConfig: {
        audioEncoding: "MP3"
      }
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return jsonError(providerMessage(data, "Google 语音生成失败。"), response.status);
  }

  if (!data.audioContent) {
    return jsonError("Google 没有返回音频内容。", 502);
  }

  const bytes = base64ToBytes(data.audioContent);
  return new Response(bytes, {
    headers: {
      "content-type": "audio/mpeg",
      "cache-control": "no-store",
      ...corsHeaders()
    }
  });
}

async function customTextToSpeech(env, form, text, sample, voiceName) {
  const url = form.get("customApiUrl") || env.CUSTOM_TTS_API_URL;
  const key = form.get("customApiKey") || env.CUSTOM_TTS_API_KEY;
  const keyHeader = form.get("customKeyHeader") || env.CUSTOM_TTS_KEY_HEADER || "Authorization";

  if (!url) {
    return jsonError("自定义模式需要填写 API 地址，或配置 CUSTOM_TTS_API_URL。", 400);
  }

  const target = validateCustomUrl(String(url));
  const body = new FormData();
  body.append("text", text);
  body.append("voiceName", voiceName);
  if (sample instanceof File) {
    body.append("sample", sample, sample.name || "sample.wav");
  }

  const headers = {};
  if (key) {
    headers[String(keyHeader)] = String(keyHeader).toLowerCase() === "authorization"
      ? `Bearer ${key}`
      : String(key);
  }

  const response = await fetch(target, {
    method: "POST",
    headers,
    body
  });

  if (!response.ok) {
    const detail = await response.text();
    return jsonError(detail || "自定义 API 生成失败。", response.status);
  }

  return audioResponse(response);
}

async function elevenLabsPresetTextToSpeech(env, form, text) {
  const voiceId = String(form.get("elevenVoiceId") || env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM");
  const modelId = normalizeModelId(form.get("modelId") || env.ELEVENLABS_MODEL_ID);
  const audio = await synthesizeSpeech(env.ELEVENLABS_API_KEY, voiceId, {
    text,
    modelId,
    stability: readNumber(form.get("stability"), 0.45, 0, 1),
    similarityBoost: readNumber(form.get("similarityBoost"), 0.8, 0, 1),
    style: readNumber(form.get("style"), 0.1, 0, 1)
  });

  return audioResponse(audio);
}

async function oneForAllTextToSpeech(env, form, text) {
  const apiKey = form.get("oneForAllApiKey") || env.ONEFORALL_API_KEY;
  const voice = Number(form.get("oneForAllVoice") || env.ONEFORALL_VOICE_ID || 3029);
  const speed = readNumber(form.get("oneForAllSpeed"), 1, 0.25, 4);
  const title = normalizeName(form.get("voiceName") || "Voice Clone Speech");

  if (!apiKey) {
    return jsonError("1forall 模式需要配置 ONEFORALL_API_KEY，或在页面中填写 API Key。", 500);
  }

  const createResponse = await fetch("https://api.1forall.ai/v1/external/speech/text-to-speech/", {
    method: "POST",
    headers: {
      "Authorization": `Api-Key ${apiKey}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify({
      title,
      speed,
      voice,
      additional_fields: {
        speed,
        volume: 1,
        pitch: 0,
        emotion: "auto",
        sample_rate: "32000",
        bitrate: "128000",
        channel: "stereo",
        language_boost: "None"
      },
      output: "mp3",
      text,
      is_clone: false
    })
  });

  const created = await createResponse.json().catch(() => ({}));
  if (!createResponse.ok) {
    return jsonError(providerMessage(created, "1forall 创建语音任务失败。"), createResponse.status);
  }

  return new Response(JSON.stringify({
    pending: true,
    provider: "oneforall",
    codeRef: created.code_ref || "",
    id: created.id || "",
    status: created.status || "pending"
  }), {
    status: 202,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...corsHeaders()
    }
  });
}

async function pollOneForAllSpeech(apiKey, created) {
  let latest = created;
  const codeRef = created.code_ref;

  if (isOneForAllCompleted(latest) && extractOneForAllFileUrl(latest)) {
    return latest;
  }

  if (!codeRef) {
    throw new ProviderError("1forall 没有返回 code_ref，无法查询生成状态。", 502);
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    await sleep(2500);
    const response = await fetch(`https://api.1forall.ai/v1/external/speech/check-status/${encodeURIComponent(codeRef)}/`, {
      headers: {
        "Authorization": `Api-Key ${apiKey}`,
        "Accept": "application/json"
      }
    });
    latest = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new ProviderError(providerMessage(latest, "1forall 查询状态失败。"), response.status);
    }

    if ((isOneForAllCompleted(latest) || attempt >= 6) && extractOneForAllFileUrl(latest)) {
      return latest;
    }

    if (latest.status === "failed" || latest.status === "error") {
      throw new ProviderError("1forall 语音任务生成失败。", 502);
    }
  }

  throw new ProviderError("1forall 生成仍在处理中，请稍后重试。", 504);
}

async function fetchOneForAllAudio(fileUrl) {
  let lastStatus = 0;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (attempt > 0) {
      await sleep(2000);
    }

    const response = await fetch(fileUrl);
    lastStatus = response.status;
    if (response.ok) {
      return response;
    }
  }

  throw new ProviderError(`1forall 音频文件下载失败，状态码 ${lastStatus || "未知"}。`, 502);
}

function isOneForAllCompleted(data) {
  const status = String(data?.status || data?.conversion?.status || "").toLowerCase();
  return ["completed", "complete", "success", "succeeded", "done"].includes(status);
}

function extractOneForAllFileUrl(data) {
  return data?.url_file
    || data?.file_url
    || data?.url
    || data?.conversion?.url_file
    || data?.conversion?.file_url
    || data?.conversion?.url
    || data?.result?.url_file
    || data?.result?.file_url
    || data?.result?.url;
}

function audioResponse(response) {
  return new Response(response.body, {
    headers: {
      "content-type": response.contentType || response.headers?.get("content-type") || "audio/mpeg",
      "cache-control": "no-store",
      ...corsHeaders()
    }
  });
}

async function readProviderResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  return { detail: text };
}

function providerMessage(data, fallback) {
  if (!data) {
    return fallback;
  }

  if (typeof data.detail === "string") {
    return data.detail || fallback;
  }

  if (typeof data.message === "string") {
    return data.message || fallback;
  }

  if (data.detail?.message) {
    return data.detail.message;
  }

  return fallback;
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeName(value) {
  const name = typeof value === "string" ? value.trim() : "";
  return name.slice(0, 60) || `voice-${crypto.randomUUID().slice(0, 8)}`;
}

function normalizeModelId(value) {
  const model = typeof value === "string" ? value.trim() : "";
  return model || "eleven_multilingual_v2";
}

function normalizeProvider(value) {
  const provider = typeof value === "string" ? value.trim().toLowerCase() : "";
  return ["elevenlabs", "elevenlabs_tts", "azure", "google", "oneforall", "custom"].includes(provider) ? provider : "elevenlabs_tts";
}

function readNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, number));
}

function isAllowedAudio(file) {
  if (file.type && ALLOWED_AUDIO_TYPES.has(file.type)) {
    return true;
  }

  return /\.(aac|m4a|mp3|mp4|ogg|wav|webm)$/i.test(file.name || "");
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
    "access-control-allow-headers": "content-type"
  };
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function validateCustomUrl(value) {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase();
  const isBlockedHost = hostname === "localhost"
    || hostname === "127.0.0.1"
    || hostname === "::1"
    || /^10\./.test(hostname)
    || /^192\.168\./.test(hostname)
    || /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);

  if (url.protocol !== "https:" || isBlockedHost) {
    throw new ProviderError("自定义 API 只允许填写公开的 https 地址。", 400);
  }

  return url.toString();
}

function parseServiceAccount(value) {
  try {
    const account = JSON.parse(String(value));
    if (!account.client_email || !account.private_key) {
      throw new Error("missing fields");
    }
    return account;
  } catch {
    throw new ProviderError("Google 服务账号 JSON 无效。", 400);
  }
}

async function getGoogleAccessToken(account) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now
  };

  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claim))}`;
  const key = await importPrivateKey(account.private_key);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${base64Url(signature)}`;

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt
    })
  });

  const data = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !data.access_token) {
    throw new ProviderError(providerMessage(data, "获取 Google 访问令牌失败。"), tokenResponse.status || 502);
  }

  return data.access_token;
}

async function importPrivateKey(pem) {
  const clean = String(pem)
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replaceAll(/\s/g, "");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return crypto.subtle.importKey(
    "pkcs8",
    bytes,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

function base64Url(value) {
  const bytes = typeof value === "string"
    ? new TextEncoder().encode(value)
    : new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

class ProviderError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
  }
}
