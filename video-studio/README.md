# Video Studio - 独立视频后处理工具

完全独立的视频后处理工具，与 `desktop-companion` 互不影响。

## 功能

| 功能 | 说明 | 需要 Token |
|------|------|-----------|
| 字幕识别 | Whisper 语音转文字，自动生成 ASS+SRT 字幕 | 不需要（本地运行） |
| 字幕样式 | ASS 格式精确控制字体/字号/颜色/描边/位置 | 不需要 |
| AI 优化字幕 | DeepSeek 去语气词、修语法、智能断句 | DeepSeek API Key（可选） |
| B-roll 搜索 | Pixabay 免费视频素材搜索（国内可访问） | Pixabay API Key（免费） |
| 背景音乐 | 本地音乐文件混入视频，支持音量/淡入淡出 | 不需要 |
| 一键处理 | 全自动：识别→优化→搜索B-roll→混音乐→渲染 | 同上 |

## 快速开始

### 1. 安装依赖

```bash
cd video-studio
pip install -r requirements.txt
```

### 2. 配置

复制 `config.example.toml` 为 `config.toml`，填入你的 API Key：

```bash
copy config.example.toml config.toml
```

**必须配置的：**
- `[material] pixabay_api_key` — 去 https://pixabay.com/api/docs/ 免费注册获取

**可选但推荐的：**
- `[ai] deepseek_api_key` — 去 https://platform.deepseek.com/ 获取（1元百万token，极便宜）
- `[subtitle] provider = "whisper"` — 改用 Whisper 本地识别（更准确）

### 3. 启动

```bash
python app.py
```

浏览器打开 http://127.0.0.1:5600

### 4. 使用

#### 一键处理（推荐）
1. 填入披星教育下载的无字幕视频路径
2. 选择背景音乐（可选）
3. 点击"一键开始处理"
4. 等待完成，下载成品

#### 手动分步
1. **字幕识别** — 输入视频路径，点击识别
2. **B-roll搜索** — 输入英文关键词或根据字幕自动搜索
3. **渲染输出** — 填入视频、字幕、B-roll、音乐路径，点击渲染

## 字幕样式配置

在 `config.toml` 的 `[subtitle]` 节配置：

```toml
[subtitle]
font_name = "微软雅黑"       # 字体
font_size = 48              # 字号
primary_color = "&H00FFFFFF" # 白色 (&HAABBGGRR格式，注意是BGR)
outline_color = "&H00000000" # 黑色描边
outline_width = 2           # 描边宽度
shadow = 1                  # 阴影
position = "bottom"         # bottom/middle/top
margin_v = 60               # 距底部边距
```

常见颜色（ASS 格式是 BGR 不是 RGB）：
- 白色: `&H00FFFFFF`
- 黄色: `&H0000FFFF`
- 青色: `&H00FFFF00`
- 红色: `&H000000FF`

## 背景音乐

1. 把你的 MP3/WAV 文件放到 `storage/music/` 目录
2. 或在 WebUI 的"配置"页上传
3. 支持格式: MP3, M4A, AAC, WAV, FLAC, OGG

**关于剪映会员音乐：** 剪映会员音乐有 DRM 保护，无法直接提取使用。建议使用无版权音乐网站下载：
- https://pixabay.com/music/ （免费无版权）
- https://www.bensound.com/ （免费需署名）
- https://incompetech.com/ （Kevin MacLeod 的音乐库）

## B-roll 素材

### Pixabay（推荐，国内可访问）
1. 注册 https://pixabay.com/accounts/register/
2. 获取 API Key: https://pixabay.com/api/docs/
3. 填入 `config.toml`

### 本地素材
把你的素材视频放到 `storage/local_materials/`，配置 `[material] source = "local"`

## AI 配置（可选）

### DeepSeek（最便宜，推荐）
1. 注册 https://platform.deepseek.com/
2. 充值 1 元即可用很久（百万 token 1 元）
3. 获取 API Key 填入 `config.toml`

AI 用于：
- 从字幕内容提取 B-roll 搜索关键词
- 优化字幕文案（去语气词、修语法、智能断句）

如果不配置 AI，会使用简单分词模式，功能正常但不够智能。

## 字幕识别引擎

两种模式都需要 `faster-whisper` 库（已包含在 requirements.txt 中）。

### tiny 模式（默认）
- 使用 Whisper tiny 模型，CPU 可运行
- 速度快，准确度一般
- 首次使用会自动下载 tiny 模型（约 75MB）

### Whisper 模式（更准确）
配置 `config.toml`:
```toml
[subtitle]
provider = "whisper"
whisper_model = "medium"    # tiny/base/small/medium/large-v3
whisper_device = "cpu"      # 或 cuda（有NVIDIA显卡）
```
- medium 模型中文识别准确率很高
- 首次使用会自动下载模型（约 1.5GB）
- CPU 运行 medium 大约需要视频时长的 2-3 倍时间

## 文件结构

```
video-studio/
├── app.py                  # Flask 后端主程序
├── config.py               # 配置加载
├── subtitle.py             # 字幕识别 + ASS/SRT 生成
├── material.py             # B-roll 素材搜索下载
├── ai_keywords.py          # DeepSeek AI 关键词提取
├── bgm.py                  # 背景音乐管理
├── renderer.py             # FFmpeg 视频渲染
├── requirements.txt        # Python 依赖
├── config.example.toml     # 配置模板
├── config.toml             # 你的配置（需要自己创建）
├── static/
│   └── index.html          # WebUI 界面
└── storage/
    ├── materials/          # 下载的 B-roll 素材
    ├── local_materials/    # 本地素材
    ├── music/              # 背景音乐
    ├── output/             # 渲染输出
    └── intermediate/       # 中间文件（字幕等）
```

## 与 desktop-companion 的关系

**完全独立，互不影响：**
- 独立的目录 `video-studio/`
- 独立的 Python 依赖（`requirements.txt`）
- 独立的配置文件（`config.toml`）
- 独立的端口（5600，companion 用 5409）
- 不读取、不修改 companion 的任何文件
- companion 更新/重启不影响本工具

## FAQ

**Q: 需要安装 FFmpeg 吗？**
A: 不需要。使用 `imageio-ffmpeg` 自带的便携版 FFmpeg，pip install 时自动安装。

**Q: 处理一个视频需要多久？**
A: 取决于视频时长和硬件：
- 字幕识别（Whisper medium CPU）: 约 2-3 倍视频时长
- B-roll 搜索下载: 约 10-30 秒
- 渲染: 约 1-2 倍视频时长
- 总计: 一条 1 分钟的视频大约需要 5-8 分钟

**Q: 渲染出的视频还能二次编辑吗？**
A: 可以。同时生成 SRT 字幕文件，可以导入剪映/Premiere 进行二次编辑。ASS 字幕也可以重新编辑样式后重新渲染。

**Q: 支持哪些视频格式？**
A: FFmpeg 支持的都行：MP4, MOV, AVI, MKV, WebM 等。

**Q: 需要翻墙吗？**
A: 不需要。Pixabay 国内可访问，DeepSeek 国内可访问，faster-whisper 模型从 HuggingFace 下载（可能需要梯子，但只需下载一次，tiny 模型约 75MB）。
