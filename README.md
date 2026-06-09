# 声刻 Voice Clone

一个可部署到 Cloudflare Pages 的在线语音克隆网页。用户上传几秒钟的授权音频，输入或上传文本文件，网页会调用服务端接口生成朗读音频。

## 功能

- 上传 `wav`、`mp3`、`m4a`、`webm` 等音频样本
- 粘贴文本或上传 `.txt` 文件
- 勾选授权声明后才允许生成
- Cloudflare Pages Function 代理第三方语音 API，避免在浏览器暴露密钥
- 默认生成后删除临时克隆声音，降低隐私风险
- 本地浏览器保存最近生成记录

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
- `modelId`: 可选，默认读取环境变量
- `stability`: 可选
- `similarityBoost`: 可选
- `style`: 可选

接口返回 `audio/mpeg`。
