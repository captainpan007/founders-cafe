# Founders’ Café · 创业咖啡馆

我们想做一间以分享为本的开源咖啡馆。创业者可以在浏览器里入座，公开聊经验、提问题，也可以邀请在场的人一起做项目。支持英文和中文。公开房间和本地体验分别保存数据。

## 打开与体验

1. 在访达双击 **打开创业咖啡馆.command**。首次打开以主持人身份进入 Chrome，右上角可把界面改成中文。一般访客打开 http://127.0.0.1:8764 就能旁听。
2. 点顶部“聊天”，即可在大厅用文字和大家交流，按回车或点“发送”。未入座和无人上台时也能聊天。公开发言会在人物头顶显示约 10 秒，并按观看者的语言翻译。未入座的人说话时会在入口出现。点“看座位区”可回到场景。大厅显示最近 80 条消息，重启后清空。
3. 点空椅子或“找个座位”，点头像修改昵称、角色和输入语言。听众有 50 个座位，台上另有一席。坐下可以在续讲投票开放时投票。
4. 想上台时点“我想分享”，只填一个题目。无需提前入座或领取凭证。讲台空着就开始 15 分钟的分享，麦克风默认关闭。有人分享时自动排队，轮到后点“确认上台”。
5. 可以打字，也可以主动开麦。听众入座后可点“收听语音”。显示语言只影响自己，文字框旁的选择器决定输入语言。译文可查看原文，讲者可修订识别错误。也可以直接在大厅公开找搭档。
6. 讲者选择“发布合作卡”，填写任务、交付物、技能、工时和报酬。参与者在合作卡上公开提出提议；所有访客都可以在“公开讨论”中查看和回复，包括尚未入座的旁听者。合作双方可以分别确认下一步。金额和币种单独显示。
7. 主持人可预告下一场。举报仅在主持人的视图中可见，主持人可静音、撤下合作卡或结束分享。未开场时，房间保持真实空场。
8. 结束本机体验可双击 **关闭创业咖啡馆.command**。项目不会设置开机自启。

## 房间与保留期限

- 服务端按单一单调顺序处理入座和晋升。一进程独占一个房间目录。候位、候讲邀请各保留 30 秒。关页断线保留座位或讲台 60 秒。主动结束分享立即交台。
- 最后 2 分钟开启续讲投票，资格取开放瞬间在线、在座且未被静音的听众。不重复计票。10 票结束，11 票起续 15 分钟，每轮清零，无次数上限。
- 座位和讲台随房间进程重置。音频只在内存转发、识别；散场清除公开字幕。合作卡散场后最多保留 7 天，已接受的合作会话最后更新 30 天后清理。浏览器或另一参与者可能自行保留看到的内容。
- 大厅发言、讲台问答和新版合作讨论在房间内共享。旧版私人提议和消息沿用原保留期限，不进入公开页面。
- 私有数据、密钥、模型和本地日志在忽略提交的 `.runtime/`，包括主持人凭证。跨标签页恢复靠会话或原邀请。使用独立存储，与 AVOS 的业务库无关。

## 开发者复跑

本机安装已经完成。重新搭建需要 Python 3.12 和 uv。以下命令只安装本项目依赖；首次获取公开模型需要网络。日常使用无需云 API。

```sh
uv venv --python 3.12 .venv
uv pip sync --python .venv/bin/python local/requirements.lock
.venv/bin/python local/fetch_models.py
# macOS 26 选项。已安装的本机翻译语言可用时优先采用。
swiftc -O -parse-as-library local/Translate.swift -o .runtime/local-translate
.venv/bin/python local/launch.py
```

客户端使用原生网页、Canvas、Web Audio 和 WebSocket。Python 服务负责房间、音频广播、限额和私有数据。语音使用本地 faster-whisper small。中英翻译优先使用已安装的 Apple 本机语言，缺少时使用已下载的 Argos / OPUS-MT 两个方向。金额字段不经过机器翻译。首次运行已固定模型版本或下载文件哈希。

```sh
.venv/bin/python -m unittest discover -s tests -v
.venv/bin/python tests/language_trial.py
.venv/bin/python tests/transport_trial.py
# UI 验收需已安装 Chrome 与隔离的 Playwright 测试环境
.runtime/browser-env/bin/python tests/browser_trial.py
```

浏览器验收使用项目独立测试环境与临时身份，不使用个人 Chrome 配置或真实麦克风。重建测试环境时执行 `uv venv --python 3.12 .runtime/browser-env`，随后执行 `uv pip install --python .runtime/browser-env/bin/python -r tests/browser-requirements.txt`。语音基准使用本机 macOS 合成语音和 ffmpeg。

跨设备试用需要两台设备可以访问的同一服务地址。支持显式提供局域网私有地址及受测试设备信任的 TLS 证书，参数为 `--private-ip`、`--cert` 和 `--tls-key`，详见 `server.py --help`。本机启动器默认仅供本机使用。公网版单独绑定回环端口，通过 HTTPS 入口接受访客。真人跨设备音质仍待单独验收。

## 模型与素材

- 像素咖啡馆、桌椅、角色和动作均由项目绘制。
- Argos 包含的双向 OPUS-MT 模型由 Jörg Tiedemann 与 Santhosh Thottingal 等人制作，模型包标明 CC BY 4.0。下载脚本保留模型说明。[Argos 模型索引](https://github.com/argosopentech/argospm-index) · [OPUS-MT](https://github.com/Helsinki-NLP/Opus-MT)
- 使用 Systran 转换的 Whisper small 多语言模型，固定版本见下载脚本。[模型发布页](https://huggingface.co/Systran/faster-whisper-small)

## 公网公测

固定入口为 [创业咖啡馆](https://founders-cafe.xiongmaopan7.workers.dev/)。入口使用 Cloudflare 免费静态托管，当前会跳转到独立的公测房间。实时聊天、语音与翻译运行在开机联网的 Mac 上。Mac 休眠、断网或房间进程退出时，访客会暂时无法进入。公测采用的 Quick Tunnel 没有可用性保证。[Cloudflare 公测隧道说明](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)

恢复公网房间时，在项目目录运行 `.venv/bin/python local/publish/serve.py` 并保持运行。脚本使用项目内的 cloudflared 或 PATH 中的 cloudflared，启动独立房间并验证健康状态，然后用已登录的 Wrangler 更新固定入口。公测数据位于忽略提交的 `.runtime/public-room/`。本机双击启动器继续使用原内测房间。
