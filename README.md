# Founders’ Café · 创业咖啡馆

一间能在浏览器里入座、听分享和寻找协作者的卡通咖啡馆。当前交付为本地封闭内测版，支持英文和中文。默认仅在这台 Mac 上运行。

## 打开与体验

1. 在访达双击 **打开创业咖啡馆.command**。首次打开以主持人身份进入 Chrome，右上角可把界面改成中文。一般访客打开 http://127.0.0.1:8764 就能旁听。
2. 点顶部“聊天”，即可在大厅用文字和大家交流，按回车或点“发送”。未入座和无人上台时也能聊天。公开发言会在人物头顶显示约 10 秒，并按观看者的语言翻译。未入座的人说话时会在入口出现。点“看座位区”可回到场景。大厅显示最近 80 条消息，重启后清空。
3. 点空椅子或“找个座位”，点头像修改昵称、角色和输入语言。听众有 50 个座位，台上另有一席。主持人和普通参与者都可以申请上台。
4. 在自己的名片里点“生成参与者邀请”。同一台电脑可用 Chrome 无痕窗口打开邀请，模拟第二位参与者。每枚邀请只给一人，重复使用会回到同一身份。主持人入口不要分享。
5. 填题目、确认上台后开始 15 分钟。可以打字或主动开麦。听众入座后点击“收听语音”。显示语言只影响自己，文字框旁的选择器决定发言的源语言。译文可查看原文，讲者可修订识别错误。需要时可在申请表填项目名字供字幕参考。
6. 讲者选择“发布合作卡”，填写任务、交付物、技能、工时和报酬。接受提议后，双方可以在“我的合作”里继续聊天，也可以分别确认已经约定下一步。金额和币种单独显示。
7. 主持人可预告下一场。举报进入主持人的“我的合作”，可静音、撤下合作卡或结束分享。未开场时，房间保持真实空场。
8. 结束本机体验可双击 **关闭创业咖啡馆.command**。项目不会设置开机自启。

## 房间与保留期限

- 服务端按单一单调顺序处理入座和晋升。一进程独占一个房间目录。候位、候讲邀请各保留 30 秒。关页断线保留座位或讲台 60 秒。主动结束分享立即交台。
- 最后 2 分钟开启续讲投票，资格取开放瞬间在座的已领证听众。不重复计票。10 票结束，11 票起续 15 分钟，每轮清零，无次数上限。
- 座位和讲台随房间进程重置。音频只在内存转发、识别；散场清除公开字幕。合作卡散场后最多保留 7 天，已接受的合作会话最后更新 30 天后清理。浏览器或另一参与者可能自行保留看到的内容。
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

跨设备试用需要两台设备可以访问的同一服务地址。支持显式提供局域网私有地址及受测试设备信任的 TLS 证书，参数为 `--private-ip`、`--cert` 和 `--tls-key`，详见 `server.py --help`。默认启动器绑定本机回环地址。公网发布、跨网通话和真人双设备音质仍待单独验收。

## 模型与素材

- 像素咖啡馆、桌椅、角色和动作均由项目绘制。
- Argos 包含的双向 OPUS-MT 模型由 Jörg Tiedemann 与 Santhosh Thottingal 等人制作，模型包标明 CC BY 4.0。下载脚本保留模型说明。[Argos 模型索引](https://github.com/argosopentech/argospm-index) · [OPUS-MT](https://github.com/Helsinki-NLP/Opus-MT)
- 使用 Systran 转换的 Whisper small 多语言模型，固定版本见下载脚本。[模型发布页](https://huggingface.co/Systran/faster-whisper-small)
