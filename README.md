# 声刻 Voice Clone

一个可部署到 Cloudflare Pages 的在线语音克隆/文本转语音网页。用户上传几秒钟的授权音频，输入或上传文本文件，网页会调用服务端接口生成朗读音频。

## 功能

- 上传 `wav`、`mp3`、`m4a`、`webm` 等音频样本
- 粘贴文本或上传 `.txt` 文件
- 勾选授权声明后才允许生成
- Cloudflare Pages Function 代理第三方语音 API，避免把固定密钥写进前端代码
- 支持 ElevenLabs、Microsoft Azure Speech、Google Cloud Text-to-Speech、自定义兼容 API
- 默认生成后删除临时克隆声音，降低隐私风险
- 本地浏览器保存最近生成记录

## API 提供商

| 提供商 | 是否支持几秒音频克隆 | 是否可能有免费额度 | 说明 |
| --- | --- | --- | --- |
| ElevenLabs | 支持 | 可能有试用/免费额度 | 最接近本项目“上传几秒音频复刻声音”的目标，长期使用通常要付费。 |
| Microsoft Azure Speech | 普通 TTS 免费额度支持；Personal Voice/Custom Voice 需申请 | 有普通 TTS 免费层 | 适合免费/低成本朗读，但默认不是声音克隆。 |
| Google Cloud Text-to-Speech | 不支持本项目这种几秒即时克隆 | 有普通 TTS 免费额度 | 适合普通朗读，需要 Google Cloud 服务账号。 |
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
DELETE_TEMP_VOICE=true

# 可选：Microsoft Azure Speech
AZURE_SPEECH_KEY=你的 Azure Speech Key
AZURE_SPEECH_REGION=eastus
AZURE_SPEECH_VOICE=zh-CN-XiaoxiaoNeural

# 可选：Google Cloud Text-to-Speech
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
GOOGLE_TTS_LANGUAGE=cmn-CN
GOOGLE_TTS_VOICE=cmn-CN-Standard-A

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
   - `ELEVENLABS_API_KEY`
   - `ELEVENLABS_MODEL_ID`，可选，默认 `eleven_multilingual_v2`
   - `DELETE_TEMP_VOICE`，可选，默认 `true`
   - `AZURE_SPEECH_KEY`、`AZURE_SPEECH_REGION`、`AZURE_SPEECH_VOICE`，可选，用于 Microsoft Azure 普通文本转语音
   - `GOOGLE_SERVICE_ACCOUNT_JSON`、`GOOGLE_TTS_LANGUAGE`、`GOOGLE_TTS_VOICE`，可选，用于 Google Cloud Text-to-Speech
   - `CUSTOM_TTS_API_URL`、`CUSTOM_TTS_API_KEY`、`CUSTOM_TTS_KEY_HEADER`，可选，用于自定义 API
5. 重新部署。

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
- `provider`: `elevenlabs`、`azure`、`google` 或 `custom`
- `modelId`: 可选，默认读取环境变量
- `stability`: 可选
- `similarityBoost`: 可选
- `style`: 可选
- `azureRegion`、`azureKey`、`azureVoice`: 可选，Azure 模式
- `googleLanguage`、`googleVoice`、`googleServiceAccount`: 可选，Google 模式
- `customApiUrl`、`customApiKey`、`customKeyHeader`: 可选，自定义 API 模式

接口返回 `audio/mpeg`。

## 费用提醒

GitHub 和 Cloudflare Pages 负责托管网页，通常可以免费开始。真正产生费用的是语音 API：

- “普通文本转语音”更容易找到免费额度。
- “根据几秒音频复刻声音”属于声音克隆，免费额度少，很多平台需要付费或申请权限。
- 页面里临时填写的密钥只会发到你自己的 Cloudflare Function，由它转发给对应 API；正式使用建议放在 Cloudflare 环境变量里。
