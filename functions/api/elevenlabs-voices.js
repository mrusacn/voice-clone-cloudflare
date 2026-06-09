export async function onRequestGet(context) {
  const { env } = context;

  if (!env.ELEVENLABS_API_KEY) {
    return jsonError("服务端还没有配置 ELEVENLABS_API_KEY。", 500);
  }

  const response = await fetch("https://api.elevenlabs.io/v1/voices", {
    headers: {
      "xi-api-key": env.ELEVENLABS_API_KEY,
      "accept": "application/json"
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return jsonError(providerMessage(data, "获取 ElevenLabs 音色列表失败。"), response.status);
  }

  const voices = Array.isArray(data.voices)
    ? data.voices.map((voice) => ({
      id: voice.voice_id,
      name: voice.name,
      category: voice.category || "",
      description: voice.description || "",
      labels: voice.labels || {}
    })).filter((voice) => voice.id && voice.name)
    : [];

  return new Response(JSON.stringify({ voices }), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...corsHeaders()
    }
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: corsHeaders()
  });
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
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "content-type"
  };
}
