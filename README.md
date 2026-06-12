# 声刻 Voice Clone

一个可部署到 Cloudflare Pages 的在线语音克隆/文本转语音网页。用户上传几秒钟的授权音频，输入或上传文本文件，网页会调用服务端接口生成朗读音频。

## 功能

- 上传 `wav`、`mp3`、`m4a`、`webm` 等音频样本
- 手机或电脑可直接录制约 10 秒参考声音，并提供中文、英文、韩文录音参考句
- 粘贴文本或上传 `.txt` 文件
- 勾选授权声明后才允许生成
- Cloudflare Pages Function 代理第三方语音 API，避免把固定密钥写进前端代码
- 支持 Edge TTS 免费音色、Hugging Face F5-TTS 克隆、ElevenLabs 免费普通 TTS、ElevenLabs 声音克隆、Microsoft Azure Speech、Google Cloud Text-to-Speech、自定义兼容 API
- 默认生成后删除临时克隆声音，降低隐私风险
- 本地浏览器保存最近生成记录

## API 提供商

| 提供商 | 是否支持几秒音频克隆 | 是否可能有免费额度 | 说明 |
| --- | --- | --- | --- |
| Edge TTS 免费音色 | 不支持 | 内置在本项目 Cloudflare Functions | 推荐中文、韩文、英文原生音色，不依赖外部 `i711.de5.net`。 |
| Hugging Face F5-TTS 克隆 | 支持 | Space 免费 CPU 可试用但较慢 | 调用你自己的 Hugging Face Space，上传参考音频和参考原文生成克隆语音。 |
| ElevenLabs 免费 TTS | 不支持 | 免费版通常可用普通文字转语音额度 | 不上传音频，直接选择官方音色朗读文字。 |
| ElevenLabs 克隆 | 支持 | 免费版通常不含 Instant Voice Cloning | 最接近本项目“上传几秒音频复刻声音”的目标，但需要支持克隆的套餐。 |
| Microsoft Azure Speech | 普通 TTS 免费额度支持；Personal Voice/Custom Voice 需申请 | 有普通 TTS 免费层 | 适合免费/低成本朗读，但默认不是声音克隆。 |
| Google Cloud Text-to-Speech | 不支持本项目这种几秒即时克隆 | 有普通 TTS 免费额度 | 适合普通朗读，需要 Google Cloud 服务账号。 |
| 1forall.ai | 当前接入普通 TTS；克隆声音需另接 cloned voice 接口 | 取决于 1forall 账号额度 | 使用 `speech/text-to-speech`，创建任务后自动轮询状态并下载音频。 |
| 自定义 API | 取决于你的接口 | 取决于你的接口 | 以 `multipart/form-data` 发送 `text`、`voiceName`、`sample` 字段，并期待直接返回音频。 |

## 本地运行

1. 安装依赖：

```bash
npm install
```

2. 新建 `.dev.vars`：

```ini
ELEVENLABS_API_KEY=你的 ElevenLabs API Key
ELEVENLABS_MODEL_ID=eleven_multilingual_v2
ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM
DELETE_TEMP_VOICE=true

# 可选：Edge TTS
# EDGE_TTS_ENDPOINT 留空时使用本项目内置接口；只有要调用外部 Worker 时才填写。
EDGE_TTS_ENDPOINT=
EDGE_TTS_FALLBACK_ENDPOINT=https://i711.de5.net
EDGE_TTS_API_KEY=如果想给自己的 Edge TTS 接口加访问密码才填写
EDGE_TTS_VOICE=zh-CN-XiaoxiaoNeural

# 可选：Hugging Face F5-TTS 克隆
HF_SPACE_URL=https://dragonkim-voice-clone-f5-tts.hf.space
HF_SPACE_API_KEY=如果你在 Hugging Face Space 设置了 HF_SPACE_API_KEY 才填写
HF_REF_TEXT=可选，默认参考音频原文

# 可选：Microsoft Azure Speech
AZURE_SPEECH_KEY=你的 Azure Speech Key
AZURE_SPEECH_REGION=eastus
AZURE_SPEECH_VOICE=zh-CN-XiaoxiaoNeural

# 可选：Google Cloud Text-to-Speech
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
GOOGLE_TTS_LANGUAGE=cmn-CN
GOOGLE_TTS_VOICE=cmn-CN-Standard-A

# 可选：1forall.ai Text-to-Speech
ONEFORALL_API_KEY=你的 1forall API Key
ONEFORALL_VOICE_ID=3029

# 可选：自定义兼容 API
CUSTOM_TTS_API_URL=https://api.example.com/tts
CUSTOM_TTS_API_KEY=你的自定义密钥
CUSTOM_TTS_KEY_HEADER=Authorization
```

3. 启动：

```bash
npm run dev
```

打开 Wrangler 显示的本地地址。

## 部署到 Cloudflare Pages

1. 把本目录提交到 GitHub。
2. 在 Cloudflare Dashboard 创建 Pages 项目，连接 GitHub 仓库。
3. 构建设置：
   - Framework preset: `None`
   - Build command: 留空或 `npm install`
   - Build output directory: `public`
4. 在 Pages 项目里添加环境变量：
   - `SITE_PASSWORD`，可选，填写后打开网页需要先输入访问密码
   - `SITE_PASSWORD_COOKIE_DAYS`，可选，密码登录保持天数，默认 `7`，最大 `30`
   - `ELEVENLABS_API_KEY`
   - `ELEVENLABS_MODEL_ID`，可选，默认 `eleven_multilingual_v2`
   - `ELEVENLABS_VOICE_ID`，可选，ElevenLabs 免费 TTS 默认音色
   - `DELETE_TEMP_VOICE`，可选，默认 `true`
   - `EDGE_TTS_ENDPOINT`、`EDGE_TTS_FALLBACK_ENDPOINT`、`EDGE_TTS_API_KEY`、`EDGE_TTS_VOICE`，可选，用于 Edge TTS。`EDGE_TTS_ENDPOINT` 留空表示优先使用本项目内置接口；`EDGE_TTS_FALLBACK_ENDPOINT` 用于内置 WebSocket 失败时兜底
   - `HF_SPACE_URL`、`HF_SPACE_API_KEY`、`HF_REF_TEXT`，可选，用于 Hugging Face F5-TTS 克隆
   - `AZURE_SPEECH_KEY`、`AZURE_SPEECH_REGION`、`AZURE_SPEECH_VOICE`，可选，用于 Microsoft Azure 普通文本转语音
   - `GOOGLE_SERVICE_ACCOUNT_JSON`、`GOOGLE_TTS_LANGUAGE`、`GOOGLE_TTS_VOICE`，可选，用于 Google Cloud Text-to-Speech
   - `ONEFORALL_API_KEY`、`ONEFORALL_VOICE_ID`，可选，用于 1forall.ai Text-to-Speech
   - `CUSTOM_TTS_API_URL`、`CUSTOM_TTS_API_KEY`、`CUSTOM_TTS_KEY_HEADER`，可选，用于自定义 API
5. 重新部署。

### 给网页设置访问密码

如果你想让别人打开网页前先输入密码：

1. 进入 Cloudflare Pages 项目。
2. 打开 `设置` -> `变量和密钥`。
3. 添加变量：
   - 变量名：`SITE_PASSWORD`
   - 值：你想设置的网页密码
4. 保存后重新部署一次。

设置成功后，访问网页会先显示密码页。删除 `SITE_PASSWORD` 变量并重新部署，就会取消密码保护。已登录的浏览器默认 7 天内不用重复输入密码，可以用 `SITE_PASSWORD_COOKIE_DAYS` 调整。

## 合规提醒

只上传你自己的声音，或已获得明确授权的声音。不要用于冒充他人、诈骗、绕过身份验证、虚假背书、违法或侵权内容。

## API 说明

前端调用：

```http
POST /api/clone-and-speak
Content-Type: multipart/form-data
```

字段：

- `sample`: 音频文件
- `text`: 要朗读的文本
- `voiceName`: 声音名称
- `consent`: 必须为 `true`
- `provider`: `edge_tts`、`huggingface_f5`、`elevenlabs_tts`、`elevenlabs`、`azure`、`google`、`oneforall` 或 `custom`
- `edgeEndpoint`、`edgeApiKey`、`edgeVoice`、`edgeSpeed`、`edgePitch`: 可选，Edge TTS 模式
- `hfSpaceUrl`、`hfApiKey`、`hfRefText`、`hfNfeSteps`、`hfMaxSegmentChars`: 可选，Hugging Face F5-TTS 模式
- `elevenVoiceId`: 可选，ElevenLabs 免费 TTS 音色
- `modelId`: 可选，默认读取环境变量
- `stability`: 可选
- `similarityBoost`: 可选
- `style`: 可选
- `azureRegion`、`azureKey`、`azureVoice`: 可选，Azure 模式
- `googleLanguage`、`googleVoice`、`googleServiceAccount`: 可选，Google 模式
- `oneForAllApiKey`、`oneForAllVoice`、`oneForAllSpeed`: 可选，1forall 模式
- `customApiUrl`、`customApiKey`、`customKeyHeader`: 可选，自定义 API 模式

接口返回 `audio/mpeg`。

## 费用提醒

GitHub 和 Cloudflare Pages 负责托管网页，通常可以免费开始。真正产生费用的是语音 API：

- “普通文本转语音”更容易找到免费额度。
- “根据几秒音频复刻声音”属于声音克隆，免费额度少，很多平台需要付费或申请权限。
- 如果 ElevenLabs 报 `Your subscription does not include instant voice cloning`，请选择网页里的 `ElevenLabs 免费 TTS`，不要选择 `ElevenLabs 克隆`。
- `ElevenLabs 免费 TTS` 内置中文、韩文、英文推荐音色分组；使用多语言模型时，实际朗读语言由输入文本决定。
- 如果需要纯中国人普通话或纯韩国人韩语发音，优先选择 `Edge TTS 免费音色`、`Microsoft Azure 免费 TTS` 或 `Google Cloud 免费 TTS` 里的原生中文/韩文音色。ElevenLabs 英文预置音色读中文/韩文可能会有外国口音。
- 页面里临时填写的密钥只会发到你自己的 Cloudflare Function，由它转发给对应 API；正式使用建议放在 Cloudflare 环境变量里。
