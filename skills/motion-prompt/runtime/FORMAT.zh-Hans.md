# Motion Prompt 素材包与 API 格式

Motion Prompt 是用于向 AI 描述创作需求的术语库，每项附带动态示例。每个元素都是不依赖外部库的 Canvas 2D 小动画，画面是**时间的纯函数**。名称、一句话释义、提问示例和复制提示词可按语言提供，用户可以让 Claude Code 或 Codex“使用 #012 和 #045”，或“把这个标题替换为 #005”。

源码仓库为 [JackEngineer/motion-prompt](https://github.com/JackEngineer/motion-prompt)。保留 MIT 许可证及原作者大滝昇平（Shohei Ohtaki，@showheyohtaki）的署名。[原作仓库](https://github.com/showheyohtaki/motion-prompt)

没有构建框架。示例库、素材包、API 和技能采用原生 HTML/CSS/JS，以及 Node 18+ 脚本，不依赖 npm 包。只有用于自制视频渲染的 `make-your-own/` 有 `package.json`，需要 Playwright 和 ffmpeg。

## 目录结构

```text
index.html  assets/{runtime.js,site.css,site.js,catalog.js*}   示例库（* 为生成文件）
packs/<pack>/pack.js  packs/<pack>/meta.json  （可选 fonts/、img/）  数据源
data/tags.zh-Hans.json                      中文标签词典
packs/README.zh-Hans.md  packs/<pack>/README.<lang>.md*   生成的术语列表
api/v1/…                                   生成并提交到仓库的静态 API
tools/build.mjs  tools/check.mjs            生成器与检查工具
tools/build-skill.mjs  tools/check-skill.mjs  离线技能包构建与复制安装验证
skills/motion-prompt/{SKILL.md,scripts/,references/,runtime/}   代理技能和离线资源
.claude-plugin/{plugin.json,marketplace.json}
dev/preview.html                           单个素材包预览
make-your-own/                             提示词、渲染脚本和两套中文模板
```

全局 ID 按下列素材包顺序分配，固定为三位，新素材包追加到末尾：

| 顺序 | 素材包 | 元素数 | 编号 | 标题 |
|---|---|---|---|---|
| 1 | `motion` | 24 | 001–024 | 动态图形 |
| 2 | `camera` | 24 | 025–048 | 镜头运动与转场 |
| 3 | `ui` | 24 | 049–072 | UI 组件 |
| 4 | `lp` | 24 | 073–096 | 落地页与网页效果 |
| 5 | `photo` | 24 | 097–120 | 摄影表现、布光与风格 |
| 6 | `motion2` | 24 | 121–144 | 动态图形第二辑 |
| 7 | `lp2` | 24 | 145–168 | 网页效果第二辑 |
| 8 | `camera2` | 24 | 169–192 | 镜头运动与转场第二辑 |
| 9 | `artstyle` | 24 | 193–216 | 图像生成画风 |
| 10 | `diagram` | 24 | 217–240 | 演示文稿图解与图表 |

**公开发布后，不重新分配编号，也不更改已发布名称。** 新素材包使用下一个 `order` 和空闲 ID。仅当素材包位于最后时，才能向包末尾追加元素；否则应新建素材包。

## packs/<pack>/pack.js

```js
/* Motion Prompt · pack "<pack>" · MIT License (c) 2026 Shohei Ohtaki · https://github.com/showheyohtaki/motion-prompt */
MotionPrompt.pack('<pack>', function () {
  // @kit
  // 整个素材包共用的常量（CW、CH、CYC、调色板 C、字体）和辅助函数
  const CELLS = [];

  // @element 01
  // 一句话描述
  CELLS[0] = (k, w, h, u) => { ... };

  // @shared
  // 后续多个元素共用的辅助函数；可选，可有多个区块

  // @element 02
  ...
  // @end
  return { width: CW, height: CH, cycle: CYC, cells: CELLS, fonts: [] };
});
```

规则：

- 标记行必须严格使用两个空格缩进的 `// @kit`、`// @element NN`、`// @shared`、`// @end`。构建器以标记切分代码；元素代码从自身标记开始，到下一标记前结束。元素需要但不在自身区块内的内容，必须放在 `@kit` 或 `@shared` 中。只属于单个元素的辅助常量，如预计算粒子表，应放在该元素区块内。
- `cells[i](k, w, h, u)` 中，`k` 是已由调用方清空并包在 save/restore 中的 CanvasRenderingContext2D，`w,h` 为素材包宽高，`u` 为 `[0, cycle)` 范围内的秒数。它必须是 `u` 的纯函数：绘制时不使用 Date 或 Math.random（带固定种子的预计算表可以），不在调用间保留状态，`u = cycle → 0` 必须无缝衔接。源码可使用 `camCell`、`anim`、`abCell` 等包装器，但存入 cells 的函数签名必须一致。
- 元素只绘制自己的卡片内容，不绘制页眉、卡片外框、编号或名称标签。网站负责添加这些内容，并为各卡片设置不同播放相位。
- 除 `document.createElement('canvas')` 创建离屏画布外，不访问 DOM，不发起网络请求。
- 图片：以图像为主题的素材包可以在 `packs/<pack>/img/` 附带自制并按 MIT 发布的图片。例如 artstyle 将同一底稿按不同画风重绘。文件名小写，使用 `.webp`、`.png` 或 `.jpg`，控制体积；artstyle 使用卡片两倍尺寸的 27 张 WebP，总体约 1 MB。kit 通过 `new Image()` 从 pack.js 所在目录（`document.currentScript`）加载，单独粘贴 kit 时回退到公开站点 URL。工厂返回 `images: ['img/x.webp', …]` 和加载完成的 Promise `ready`。未加载时元素只画纯色背景，不抛异常；加载后画面仍是 `u` 的纯函数。网站在 `ready` 完成后重绘，拒绝时标记卡片加载失败；`tools/check.mjs` 和 `dev/preview.html` 会等待该 Promise，`tools/build.mjs` 检查图片文件存在。
- 字体：优先使用系统字体栈。只有字体许可明确允许在公开仓库再分发时，才能放入 `packs/<pack>/fonts/`。通过 `fonts: [{family, url:'fonts/x.otf'}]` 声明，URL 相对素材包目录，并在旁边附上许可证全文。

## packs/<pack>/meta.json

```json
{
  "pack": "motion", "order": 1,
  "title": { "zh-Hans": "动态图形", "ja": "モーショングラフィックスの動き", "en": "Motion graphics moves" },
  "categories": [ { "slug": "entrances-text", "zh-Hans": "入场与文字", "ja": "登場・文字の演出", "en": "Entrances & text" } ],
  "elements": [
    { "no": "01", "slug": "pop-in", "category": "entrances-text",
      "name": { "zh-Hans": "弹性入场", "ja": "ポップイン", "en": "Pop-in" },
      "meaning": { "zh-Hans": "元素弹跳着出现", "ja": "ポンと弾んで現れる", "en": "Pops into view with a small bounce" },
      "ask": { "zh-Hans": "让标志以弹性入场出现，时长约 0.4 s，略微超出目标尺寸后回弹。", "ja": "ロゴをポップインで出して。0.4秒で、行き過ぎは少しだけ。", "en": "Bring the logo in with a pop-in, about 0.4 s, with a slight overshoot." },
      "summary": { "zh-Hans": "…", "ja": "…", "en": "…" },
      "spec": { "zh-Hans": ["…", "…"], "ja": ["…", "…"], "en": ["…", "…"] },
      "use": { "zh-Hans": "…", "ja": "…", "en": "…" },
      "tags": ["pop", "pop-in", "spring", "bounce", "scale", "icon", "badge", "entrance"] }
  ]
}
```

- `name`：各语言中从业者实际使用的术语。不自造或生硬直译；当地通常用英文时保留英文。
- `meaning`：简短的一句话释义，英文约 40 字符、日文约 20 字符。
- `ask`：一句按名称向 AI 提需求的例子，包含时长、幅度或主体。可选，缺少时构建器会警告。
- `categories`：素材包内的元素分组。
- `summary`：用一句话描述示例中能看到什么。
- `spec`：3–6 行简短规格，让 AI **无需观看示例**也能重建运动。写明运动对象、顺序、秒数、缓动名称及 cubic-bezier 或弹簧/过冲参数、幅度（相对 539×208 卡片的 px、角度、缩放）。所有数值必须来自代码，不能编造。这是项目的核心内容。
- `use`：一句话说明何时适合在视频中使用。
- `tags` 记录 4–8 个小写英文搜索关键词，包含常见同义词。新增标签时，在 [`data/tags.zh-Hans.json`](data/tags.zh-Hans.json) 为每个键补充译名。构建时按 `tags` 原顺序生成 `tagLabels["zh-Hans"]`，缺少译名会导致构建失败。中文界面和文本使用译名，搜索保留原始关键词并加入中文译名。 同一个英文词在不同语境含义不同时，可在元素的 `tagOverrides["zh-Hans"]` 对象中按原标签键覆盖译名。例如轮播中的 `slider` 为“滑动轮播”，范围控件中的同词为“滑块”。覆盖键必须已经存在于该元素的 `tags` 中。
- 日文采用规格表风格，不用です/ます句尾、宣传语或空话。英文简明、不用俚语，术语需安全且符合惯例。中文采用自然、准确的技术表达，保留公式、代码标识和单位。

### 语言

所有文本字段，包括 `title`、每个 category、`name`、`meaning`、`ask`、`summary`、`spec`、`use`，都按语言代码组织。`en` 是素材包间的共同语言。新素材包还须补齐中文 `zh-Hans` 字段。日文等额外语言可按需添加。

例如为素材包添加西班牙文 `es`，只需编辑 `packs/<pack>/meta.json`：

1. 在 `title` 和各 `categories` 项中添加 `es`。
2. 在每个元素的 `name`、`meaning` 和 `ask` 中添加 `es`。
3. 可继续补充 `summary`、`use` 和 `spec`，其中 spec 行数应与 `spec.en` 相同。
4. 运行 `node tools/build.mjs`，生成 `packs/<pack>/README.es.md`，并添加其他列表到该文件的链接。

在非简体中文列表中，未翻译的字段可回退到英文。生成列表的标题文字，如“名称”“含义”，需要在 `tools/build.mjs` 的 `DOC` 中加入该语言区块，否则使用英文；同时在 `LANG_NAME` 中补充显示名称。

此版本的示例库、独立 API 和复制提示词支持 `ja`、`en`、`zh-Hans`；生成语言由 `tools/build.mjs` 中的 `LANGS` 定义。其他语言保存在 `api/v1/catalog.json` 和生成的术语列表中。完整中文数据包含名称、释义、提问示例、描述、规格、使用场景和标签译名。

## 生成的 API

由 `tools/build.mjs` 写入，供技能 CLI 和网站读取：

```text
api/v1/catalog.json                 { version, count, packs:[…], elements:[{ id, pack, no, slug, category, width, height, cycle, name, meaning, ask, summary, spec, use, tags, tagLabels }] }
api/v1/<lang>/catalog.tsv           注释标题行，之后为 id  pack  category  title  tags  summary（lang = ja | en | zh-Hans）
api/v1/<lang>/e/<id>.txt            许可证行、名称/描述/规格/用途/尺寸/周期/依赖: kit <pack>/动态示例 URL，随后为元素代码
api/v1/<lang>/p/<id>.txt            复制提示词，静态文本中的路径相对文件自身
api/v1/kit/<pack>.js                素材包的 @kit 与所有 @shared 区块，以及独立运行元素的简短说明
```

每个 `e/<id>.txt` 和 `kit/<pack>.js` 首行保持署名格式：

`// Motion Prompt #<id> · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#<id>`

署名中的链接用于追溯原作。页面中的提示词引用随当前站点解析，CLI 使用当前数据来源。中文 TSV 的 `tags` 列写入译名，JSON 的 `tags` 保留英文搜索键。

## 工具

- `node tools/build.mjs` 重新生成 `api/v1/`、`assets/catalog.js` 和术语列表，包括 `packs/README.zh-Hans.md` 和各素材包的语言列表。`--check` 校验源数据且不写文件。`--verify` 另逐文件核对磁盘生成内容，发现缺失、过期或多余的 API 文件时失败。有中文预览时，中文列表显示 `assets/preview-<pack>-zh-Hans.gif`。
- `node tools/build-skill.mjs` 从当前工作区重新生成 `skills/motion-prompt/runtime/`，其中包含浏览器选择所需的页面、素材和 API。打包前自动执行生成文件精确核对。`--check` 校验离线包是否与当前公共文件一致。构建先验证临时目录再替换，普通替换失败会回滚；构建期间不要并发使用或中断更新。
- `node tools/check-skill.mjs` 在独立副本中验证技能。
- `node tools/check.mjs` 在多个时刻绘制每个元素，报告异常、空白帧和循环接缝。Node 需要能加载 Playwright，它不是本仓库根目录依赖。
- 单包预览：在仓库根目录运行 `python3 -m http.server 8765 --bind 127.0.0.1`，打开 `dev/preview.html?pack=<pack>` 播放，添加 `&t=1.2` 固定在某个时刻，或 `&only=5` 仅看一个元素。
- 素材包的 `cycle` 可以长于单次运动时长，例如 camera 为 9.4 s。
- kit 首行使用素材包 ID 范围，例如 `#001-024`。
