export async function onRequestPost(context) {
  const { request, env } = context;

  let form;
  try {
    form = await request.formData();
  } catch {
    return jsonError("请使用 multipart/form-data 查询 1forall 任务。", 400);
  }

  const apiKey = form.get("oneForAllApiKey") || env.ONEFORALL_API_KEY;
  const codeRef = String(form.get("codeRef") || "");
  const id = String(form.get("id") || "");

  if (!apiKey) {
    return jsonError("1forall 模式需要配置 ONEFORALL_API_KEY。", 500);
  }

  if (!codeRef && !id) {
    return jsonError("缺少 1forall 任务编号。", 400);
  }

  try {
    const statusData = codeRef ? await fetchStatus(apiKey, codeRef) : {};
    const conversionData = id ? await fetchConversion(apiKey, id) : {};
    const merged = mergeStatus(statusData, conversionData);

    if (isFailed(merged)) {
      return jsonError("1forall 语音任务生成失败。", 502);
    }

    const fileUrl = extractFileUrl(merged);
    if (fileUrl && !isPending(merged)) {
      const audio = await tryFetchAudio(fileUrl);
      if (audio) {
        return audioResponse(audio);
      }
    }

    return new Response(JSON.stringify({
      pending: true,
      status: merged.status || statusData.status || conversionData.status || "processing",
      codeRef,
      id
    }), {
      status: 202,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        ...corsHeaders()
      }
    });
  } catch (error) {
    const message = error instanceof ProviderError
      ? error.message
      : "查询 1forall 任务失败。";
    return jsonError(message, error.status || 502);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: corsHeaders()
  });
}

async function fetchStatus(apiKey, codeRef) {
  const response = await fetch(`https://api.1forall.ai/v1/external/speech/check-status/${encodeURIComponent(codeRef)}/`, {
    headers: {
      "Authorization": `Api-Key ${apiKey}`,
      "Accept": "application/json"
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ProviderError(providerMessage(data, "1forall 查询状态失败。"), response.status);
  }
  return data;
}

async function fetchConversion(apiKey, id) {
  const response = await fetch(`https://api.1forall.ai/v1/external/speech/conversions/${encodeURIComponent(id)}/`, {
    headers: {
      "Authorization": `Api-Key ${apiKey}`,
      "Accept": "application/json"
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ProviderError(providerMessage(data, "1forall 查询结果失败。"), response.status);
  }
  return data;
}

function mergeStatus(statusData, conversionData) {
  return {
    ...statusData,
    ...conversionData,
    status: conversionData.status || statusData.status,
    url_file: conversionData.url_file || statusData.url_file,
    conversion: {
      ...(statusData.conversion || {}),
      ...(conversionData.conversion || {})
    },
    result: {
      ...(statusData.result || {}),
      ...(conversionData.result || {})
    }
  };
}

async function tryFetchAudio(fileUrl) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) {
      await sleep(1500);
    }

    const response = await fetch(fileUrl);
    if (response.ok) {
      return response;
    }
  }

  return null;
}

function isPending(data) {
  const status = String(data?.status || data?.conversion?.status || "").toLowerCase();
  return ["", "pending", "processing", "queued", "created", "started", "running"].includes(status);
}

function isFailed(data) {
  const status = String(data?.status || data?.conversion?.status || "").toLowerCase();
  return ["failed", "error", "cancelled", "canceled"].includes(status);
}

function extractFileUrl(data) {
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
      "content-type": response.headers.get("content-type") || "audio/mpeg",
      "cache-control": "no-store",
      ...corsHeaders()
    }
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
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type"
  };
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
