const sampleInput = document.querySelector("#sampleInput");
const sampleName = document.querySelector("#sampleName");
const sampleMeta = document.querySelector("#sampleMeta");
const sampleBadge = document.querySelector("#sampleBadge");
const sampleAudio = document.querySelector("#sampleAudio");
const previewButton = document.querySelector("#previewButton");
const waveform = document.querySelector("#waveform");
const dropzone = document.querySelector("#dropzone");
const voiceName = document.querySelector("#voiceName");
const consent = document.querySelector("#consent");
const scriptText = document.querySelector("#scriptText");
const textFile = document.querySelector("#textFile");
const charCount = document.querySelector("#charCount");
const clearText = document.querySelector("#clearText");
const generateButton = document.querySelector("#generateButton");
const message = document.querySelector("#message");
const outputAudio = document.querySelector("#outputAudio");
const playOutput = document.querySelector("#playOutput");
const downloadLink = document.querySelector("#downloadLink");
const provider = document.querySelector("#provider");
const modelId = document.querySelector("#modelId");
const elevenVoiceId = document.querySelector("#elevenVoiceId");
const stability = document.querySelector("#stability");
const similarity = document.querySelector("#similarity");
const style = document.querySelector("#style");
const azureRegion = document.querySelector("#azureRegion");
const azureKey = document.querySelector("#azureKey");
const azureNativeVoice = document.querySelector("#azureNativeVoice");
const azureVoice = document.querySelector("#azureVoice");
const googleLanguage = document.querySelector("#googleLanguage");
const googleVoice = document.querySelector("#googleVoice");
const googleNativeVoice = document.querySelector("#googleNativeVoice");
const googleServiceAccount = document.querySelector("#googleServiceAccount");
const oneForAllApiKey = document.querySelector("#oneForAllApiKey");
const oneForAllVoice = document.querySelector("#oneForAllVoice");
const oneForAllSpeed = document.querySelector("#oneForAllSpeed");
const customApiUrl = document.querySelector("#customApiUrl");
const customKeyHeader = document.querySelector("#customKeyHeader");
const customApiKey = document.querySelector("#customApiKey");
const historyBody = document.querySelector("#historyBody");
const historySearch = document.querySelector("#historySearch");
const clearHistory = document.querySelector("#clearHistory");

let selectedSample;
let sampleObjectUrl;
let outputObjectUrl;
let history = loadHistory();
let elevenVoicesLoaded = false;
const presetElevenVoiceIds = new Set(Array.from(elevenVoiceId.querySelectorAll("option")).map((option) => option.value));

drawEmptyWaveform();
updateCharCount();
renderHistory();
updateProviderUi();

sampleInput.addEventListener("change", () => {
  const file = sampleInput.files?.[0];
  if (file) {
    setSample(file);
  }
});

for (const eventName of ["dragenter", "dragover"]) {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.add("dragover");
  });
}

for (const eventName of ["dragleave", "drop"]) {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.remove("dragover");
  });
}

dropzone.addEventListener("drop", (event) => {
  const file = event.dataTransfer?.files?.[0];
  if (file) {
    setSample(file);
  }
});

previewButton.addEventListener("click", () => {
  if (!sampleAudio.src) {
    return;
  }

  if (sampleAudio.paused) {
    void sampleAudio.play();
  } else {
    sampleAudio.pause();
  }
});

scriptText.addEventListener("input", updateCharCount);

textFile.addEventListener("change", async () => {
  const file = textFile.files?.[0];
  if (!file) {
    return;
  }

  const text = await file.text();
  scriptText.value = text.slice(0, 5000);
  updateCharCount();
  setMessage(`已导入 ${file.name}`, "success");
});

clearText.addEventListener("click", () => {
  scriptText.value = "";
  updateCharCount();
  scriptText.focus();
});

provider.addEventListener("change", updateProviderUi);
azureNativeVoice.addEventListener("change", () => {
  azureVoice.value = azureNativeVoice.value;
});
googleNativeVoice.addEventListener("change", () => {
  const [language, voice] = googleNativeVoice.value.split("|");
  googleLanguage.value = language;
  googleVoice.value = voice;
});
generateButton.addEventListener("click", generateSpeech);

playOutput.addEventListener("click", () => {
  if (outputAudio.src) {
    void outputAudio.play();
  }
});

historySearch.addEventListener("input", renderHistory);

clearHistory.addEventListener("click", () => {
  history = [];
  saveHistory();
  renderHistory();
});

async function setSample(file) {
  selectedSample = file;

  if (sampleObjectUrl) {
    URL.revokeObjectURL(sampleObjectUrl);
  }

  sampleObjectUrl = URL.createObjectURL(file);
  sampleAudio.src = sampleObjectUrl;
  sampleName.textContent = file.name;
  sampleMeta.textContent = `${formatBytes(file.size)} · ${file.type || "audio"} · 点击下方按钮试听`;
  sampleBadge.textContent = "已上传";

  try {
    await drawWaveform(file);
  } catch {
    drawEmptyWaveform();
  }
}

async function drawWaveform(file) {
  const context = new AudioContext();
  const buffer = await file.arrayBuffer();
  const decoded = await context.decodeAudioData(buffer.slice(0));
  const data = decoded.getChannelData(0);
  const canvasContext = waveform.getContext("2d");
  const width = waveform.width;
  const height = waveform.height;
  const step = Math.ceil(data.length / width);
  const amp = height / 2;

  canvasContext.clearRect(0, 0, width, height);
  canvasContext.fillStyle = "#effaf8";
  canvasContext.fillRect(0, 0, width, height);
  canvasContext.strokeStyle = "#168b8f";
  canvasContext.lineWidth = 2;
  canvasContext.beginPath();

  for (let i = 0; i < width; i += 1) {
    let min = 1;
    let max = -1;
    for (let j = 0; j < step; j += 1) {
      const datum = data[(i * step) + j] || 0;
      if (datum < min) min = datum;
      if (datum > max) max = datum;
    }

    canvasContext.moveTo(i, (1 + min) * amp);
    canvasContext.lineTo(i, (1 + max) * amp);
  }

  canvasContext.stroke();
  sampleBadge.textContent = `${Math.round(decoded.duration)} 秒`;
  await context.close();
}

function drawEmptyWaveform() {
  const canvasContext = waveform.getContext("2d");
  const width = waveform.width;
  const height = waveform.height;

  canvasContext.clearRect(0, 0, width, height);
  canvasContext.fillStyle = "#fbfcfc";
  canvasContext.fillRect(0, 0, width, height);
  canvasContext.strokeStyle = "#c8d6d7";
  canvasContext.lineWidth = 2;
  canvasContext.beginPath();

  for (let x = 0; x < width; x += 14) {
    const wave = Math.sin(x / 24) * 16;
    canvasContext.moveTo(x, height / 2 - wave);
    canvasContext.lineTo(x, height / 2 + wave);
  }

  canvasContext.stroke();
}

async function generateSpeech() {
  const selectedProvider = provider.value;

  if (needsSample(selectedProvider) && !selectedSample) {
    setMessage("请先上传一段授权音频。", "error");
    return;
  }

  if (!consent.checked) {
    setMessage("请先勾选授权声明。", "error");
    return;
  }

  const text = scriptText.value.trim();
  if (!text) {
    setMessage("请输入要朗读的文本。", "error");
    return;
  }

  generateButton.disabled = true;
  setMessage(needsSample(selectedProvider) ? "正在克隆声音并生成语音，这可能需要几十秒。" : "正在调用文本转语音 API。", "");

  const form = new FormData();
  if (selectedSample) {
    form.append("sample", selectedSample);
  }
  form.append("text", text);
  form.append("voiceName", voiceName.value.trim() || "我的克隆声音");
  form.append("consent", "true");
  form.append("provider", selectedProvider);
  form.append("modelId", modelId.value);
  form.append("stability", stability.value);
  form.append("similarityBoost", similarity.value);
  form.append("style", style.value);

  if (selectedProvider === "elevenlabs_tts") {
    form.append("elevenVoiceId", elevenVoiceId.value);
  }

  if (selectedProvider === "azure") {
    form.append("azureRegion", azureRegion.value.trim());
    form.append("azureKey", azureKey.value.trim());
    form.append("azureVoice", azureVoice.value.trim());
  }

  if (selectedProvider === "google") {
    form.append("googleLanguage", googleLanguage.value.trim());
    form.append("googleVoice", googleVoice.value.trim());
    form.append("googleServiceAccount", googleServiceAccount.value.trim());
  }

  if (selectedProvider === "oneforall") {
    form.append("oneForAllApiKey", oneForAllApiKey.value.trim());
    form.append("oneForAllVoice", oneForAllVoice.value.trim());
    form.append("oneForAllSpeed", oneForAllSpeed.value.trim());
  }

  if (selectedProvider === "custom") {
    form.append("customApiUrl", customApiUrl.value.trim());
    form.append("customKeyHeader", customKeyHeader.value.trim());
    form.append("customApiKey", customApiKey.value.trim());
  }

  try {
    const response = await fetch("/api/clone-and-speak", {
      method: "POST",
      body: form
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "生成失败。");
    }

    const blob = await resolveGeneratedAudio(response, selectedProvider);
    setOutputAudio(blob);

    addHistory({
      id: crypto.randomUUID(),
      voiceName: voiceName.value.trim() || "我的克隆声音",
      text,
      model: provider.options[provider.selectedIndex].textContent,
      createdAt: new Date().toLocaleString("zh-CN")
    });

    setMessage("语音生成完成，可以试听或下载。", "success");
  } catch (error) {
    setMessage(error.message || "生成失败，请检查服务端配置。", "error");
  } finally {
    generateButton.disabled = false;
  }
}

function updateProviderUi() {
  const selectedProvider = provider.value;
  const sampleRequired = needsSample(selectedProvider);

  document.querySelectorAll("[data-provider-note]").forEach((element) => {
    element.classList.toggle("hidden", element.dataset.providerNote !== selectedProvider);
  });

  document.querySelectorAll("[data-provider-fields]").forEach((element) => {
    element.classList.toggle("hidden", element.dataset.providerFields !== selectedProvider);
  });

  if (selectedSample) {
    sampleBadge.textContent = "已上传";
    sampleMeta.textContent = sampleRequired
      ? `${formatBytes(selectedSample.size)} · ${selectedSample.type || "audio"} · 点击下方按钮试听`
      : "当前 API 使用内置声音朗读，已上传样本不会用于克隆。";
  } else {
    sampleBadge.textContent = sampleRequired ? "未上传" : "可不上传";
    sampleMeta.textContent = sampleRequired
      ? "支持 wav、mp3、m4a、webm，建议安静环境录制。"
      : "当前 API 使用内置声音朗读，上传样本不会用于克隆。";
  }

  modelId.disabled = !(selectedProvider === "elevenlabs" || selectedProvider === "elevenlabs_tts");
  stability.disabled = !(selectedProvider === "elevenlabs" || selectedProvider === "elevenlabs_tts");
  similarity.disabled = !(selectedProvider === "elevenlabs" || selectedProvider === "elevenlabs_tts");
  style.disabled = !(selectedProvider === "elevenlabs" || selectedProvider === "elevenlabs_tts");

  if (selectedProvider === "elevenlabs_tts") {
    void loadElevenLabsVoices();
  }

  if (selectedProvider === "azure" && azureNativeVoice.value) {
    azureVoice.value = azureNativeVoice.value;
  }

  if (selectedProvider === "google" && googleNativeVoice.value) {
    const [language, voice] = googleNativeVoice.value.split("|");
    googleLanguage.value = language;
    googleVoice.value = voice;
  }
}

function needsSample(selectedProvider) {
  return selectedProvider === "elevenlabs" || selectedProvider === "custom";
}

async function loadElevenLabsVoices() {
  if (elevenVoicesLoaded) {
    return;
  }

  try {
    const response = await fetch("/api/elevenlabs-voices");
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "获取 ElevenLabs 音色失败。");
    }

    const data = await response.json();
    if (!Array.isArray(data.voices) || !data.voices.length) {
      return;
    }

    const accountVoices = data.voices.filter((voice) => !presetElevenVoiceIds.has(voice.id));
    if (!accountVoices.length) {
      elevenVoicesLoaded = true;
      return;
    }

    const group = document.createElement("optgroup");
    group.label = "我的账号音色";
    group.innerHTML = accountVoices.map((voice) => {
      const labels = voice.labels || {};
      const suffix = [labels.gender, labels.accent, voice.category].filter(Boolean).join(" · ");
      return `<option value="${escapeHtml(voice.id)}">${escapeHtml(suffix ? `${voice.name} (${suffix})` : voice.name)}</option>`;
    }).join("");
    elevenVoiceId.appendChild(group);
    elevenVoicesLoaded = true;
  } catch (error) {
    setMessage(error.message || "获取 ElevenLabs 音色失败。", "error");
  }
}

async function resolveGeneratedAudio(response, selectedProvider) {
  const contentType = response.headers.get("content-type") || "";
  if (selectedProvider === "oneforall" && contentType.includes("application/json")) {
    const data = await response.json();
    if (data.pending) {
      return pollOneForAllAudio(data);
    }
  }

  return response.blob();
}

async function pollOneForAllAudio(task) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await wait(3000);
    setMessage(`1forall 正在生成语音，已等待 ${Math.round((attempt + 1) * 3)} 秒。`, "");

    const form = new FormData();
    form.append("codeRef", task.codeRef || "");
    form.append("id", task.id || "");
    form.append("oneForAllApiKey", oneForAllApiKey.value.trim());

    const response = await fetch("/api/oneforall-result", {
      method: "POST",
      body: form
    });

    if (response.status === 202) {
      const data = await response.json().catch(() => ({}));
      const fileHint = data.hasFileUrl ? "，已拿到音频链接，正在等待可下载" : "";
      setMessage(`1forall 正在生成语音，状态：${data.status || "processing"}${fileHint}，已等待 ${Math.round((attempt + 1) * 3)} 秒。`, "");
      continue;
    }

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "1forall 查询结果失败。");
    }

    return response.blob();
  }

  throw new Error("1forall 生成时间较长，请稍后再试。");
}

function setOutputAudio(blob) {
  if (outputObjectUrl) {
    URL.revokeObjectURL(outputObjectUrl);
  }

  outputObjectUrl = URL.createObjectURL(blob);
  outputAudio.src = outputObjectUrl;
  playOutput.disabled = false;
  downloadLink.href = outputObjectUrl;
  downloadLink.classList.remove("disabled");
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function addHistory(item) {
  history = [item, ...history].slice(0, 20);
  saveHistory();
  renderHistory();
}

function renderHistory() {
  const query = historySearch.value.trim().toLowerCase();
  const rows = history.filter((item) => {
    const haystack = `${item.voiceName} ${item.text} ${item.model}`.toLowerCase();
    return haystack.includes(query);
  });

  if (!rows.length) {
    historyBody.innerHTML = `<tr><td colspan="5" class="empty-row">暂无生成记录</td></tr>`;
    return;
  }

  historyBody.innerHTML = rows.map((item) => `
    <tr>
      <td>${escapeHtml(item.voiceName)}</td>
      <td>${escapeHtml(truncate(item.text, 64))}</td>
      <td>${escapeHtml(item.model)}</td>
      <td>${escapeHtml(item.createdAt)}</td>
      <td>
        <div class="row-actions">
          <button class="small-action" type="button" data-copy="${escapeHtml(item.id)}" aria-label="复制文本">
            <svg viewBox="0 0 24 24"><path d="M8 8h11v11H8z"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
        </div>
      </td>
    </tr>
  `).join("");

  historyBody.querySelectorAll("[data-copy]").forEach((button) => {
    button.addEventListener("click", async () => {
      const item = history.find((entry) => entry.id === button.dataset.copy);
      if (item) {
        await navigator.clipboard.writeText(item.text);
        setMessage("已复制该条文本。", "success");
      }
    });
  });
}

function updateCharCount() {
  charCount.textContent = `${scriptText.value.length} / 5000`;
}

function setMessage(text, type) {
  message.textContent = text;
  message.className = `message ${type || ""}`.trim();
}

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem("voiceCloneHistory") || "[]");
  } catch {
    return [];
  }
}

function saveHistory() {
  localStorage.setItem("voiceCloneHistory", JSON.stringify(history));
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function truncate(text, length) {
  return text.length > length ? `${text.slice(0, length)}...` : text;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
