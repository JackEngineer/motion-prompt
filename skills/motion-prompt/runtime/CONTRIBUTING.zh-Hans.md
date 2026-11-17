# 贡献指南

[English](CONTRIBUTING.md) | [日本語](CONTRIBUTING.ja.md) | **简体中文**

本仓库收录各领域中用于描述创作需求的术语。项目起初收录了 X 上发布的动态图形和镜头运动两套内容，随后加入 UI 组件、网页效果、摄影表现、图像生成画风和演示文稿图解图表。**欢迎用自己的语言补充熟悉领域的共同术语。**

不限于视频领域。布光、声音、UI 与交互、摄影、字体排印、插画、烹饪、建筑、时尚、音乐、舞蹈、游戏都可以。如果同行会互相说“做一个 ___”，而外行不知道那个词，它就适合收录。

不必亲自编写代码。[中文制作提示词](make-your-own/README.zh-Hans.md#提示词)可让 Claude Code、Codex、Cursor 等编程 AI 完成大部分实现。只有你能提供的，是对术语实际用法的了解。

## 三种参与方式

| 方式 | 内容 | 提交方法 | 存放位置 |
|---|---|---|---|
| 素材包 | 某领域的术语及动态示例，或已有素材包的新语言 | 提交拉取请求，或先用[术语与素材包建议](https://github.com/JackEngineer/motion-prompt/issues/new?template=1-contribution.yml)讨论 | `packs/<pack>/` |
| 发现的案例 | X 上分享术语和示例的帖子，也欢迎自荐 | [推荐案例](https://github.com/JackEngineer/motion-prompt/issues/new?template=2-example.yml) | 本地[案例页面](found.html)与 `examples/found.json` |
| 自制内容或修正 | 通过 make-your-own 制作的视频、HTML、速查图，或术语修正 | 拉取请求 或[建议表单](https://github.com/JackEngineer/motion-prompt/issues/new?template=1-contribution.yml) | `make-your-own/examples/<slug>/<lang>/` 等 |

“自制示例”是你亲自制作的内容。“发现的案例”是其他创作者发布在 X 的帖子。

### 案例收录方式

- 他人的帖子只通过 X 官方嵌入、链接和我们撰写的一句话介绍展示。不将图片、视频、截图或帖子正文复制到仓库或网站。
- `examples/found.json` 只保存帖子 ID（`id`）、作者（`author`）、`url`、主题（`theme`）、多语言一句话介绍（`intro`）、帖子语言（`lang`）和加入日期（`added`）。不保存正文、点赞数等数据。
- 介绍应由我们用自己的话写成，不抄录帖子，也不让读者误以为作者推荐本网站。
- 收录作者自制示例的帖子，如带名称的动态示例或速查表。不收录未署名使用他人作品、仅转引其他帖子、主要推广付费课程或产品的内容，也不收录企业广告。
- 案例页面不刊登课程或服务广告。
- 删除或更正请求通过 [议题表单](https://github.com/JackEngineer/motion-prompt/issues/new?template=3-removal.yml)提交，确认后尽快处理。

### 只接收可按 MIT 许可证发布的内容

仓库内容以 MIT 许可证发布。不接受无法按此许可证发布的材料，例如他人的作品、不可再分发的字体或未经许可的照片。如果不想以 MIT 发布，可以将作品放在自己的网站或 X，再推荐为案例；网站会使用嵌入和链接展示。

## 可以添加什么

| 内容 | 说明 | 位置 |
|---|---|---|
| 新语言 | 为已有素材包补充另一种语言 | `packs/<pack>/meta.json` |
| 新素材包 | 新领域或同领域下一辑的术语及动态示例 | `packs/<pack>/` |
| 自制示例 | 自制视频、HTML 源码和速查图 | `make-your-own/examples/<slug>/<lang>/` |
| 修正 | 纠正错误、不清晰或不符合当地习惯的术语 | 议题或 拉取请求 |

小规模 拉取请求 也欢迎。为一个素材包补充一种语言就是完整的贡献。

## 术语要求

1. **确实有人使用。** 从业者会说或写这个词。输入 AI 提示词或搜索框，能够找到对应内容。
2. **不自造、不生硬直译。** 如果本地语言通常保留 J-cut、Easing 等英文术语，就保留英文。两个说法都常见时，选更常用的，并在 拉取请求 中注明另一个。
3. **说明核对来源。** 教科书、软件手册、行业词汇表、知名教程或自身多年从业经验都可以。在 拉取请求 描述中逐条简单注明来源即可。不确定的术语也请标明，方便审阅。
4. **提供一句话释义和提问示例。** `meaning` 用普通语言解释含义。`ask` 用一句话按名称向 AI 提出需求，并包含时长、幅度或主体。
5. **可安全使用。** 不以品牌或商标命名技法，除非行业已将其当作通用名称。

## 示例要求

示例是名称旁的小动画。配色、字体和绘制风格可自行决定，不必与已有素材包一致。无论采用何种风格，都需满足以下要求：

- **隐藏标签仍能识别。** 熟悉领域的人只看示例就能知道术语。每张卡片展示一个效果。
- **手机可读。** 对比充分，关键内容不要画得太小。
- **无闪烁。** 不快速切换大面积明暗。
- **无缝循环。** 末帧自然衔接首帧。
- **画面只由时间决定。** 同一时刻总是相同画面。不读取时钟，不使用无固定种子的随机数，不在帧间保留状态。
- **不从网络加载，不使用他人素材。** 不加载网络字体、图片、标志、角色或照片。仅当字体许可明确允许再分发时，才可附带字体文件，并同时附上许可证。以图片为主题的素材包，如画风，可以附带作者自制并以 MIT 发布的图片，详见[格式说明](FORMAT.zh-Hans.md)的图片规则。

## 为已有素材包添加语言

`packs/<pack>/meta.json` 中的文本字段是按语言代码组织的对象，例如 `"name": { "ja": "パン", "en": "Pan" }`。

1. 在 `title`、每个 `categories` 项，以及每个元素的 `name`、`meaning`、`ask` 中添加语言代码，例如 `es`、`ko`、`zh-Hans`、`fr`。
2. 补充 `summary`、`use` 和 `spec`。简体中文字段必须齐全。若增加了原始标签，在 [中文标签词典](data/tags.zh-Hans.json)为每个新键填写译名。
3. 运行 `node tools/build.mjs`。脚本校验文件并生成 `packs/<pack>/README.<lang>.md`，同时从其他列表添加链接。
4. 运行 `node tools/build-skill.mjs` 更新离线技能包。将源文件和生成文件一并提交拉取请求，说明术语核对来源。

可以让编程 AI 完成前三步，例如：“参照 CONTRIBUTING.zh-Hans.md，为 packs/camera/meta.json 添加西班牙文，并列出不确定的术语。”随后请亲自核对术语，这正是贡献的关键。

此版本为示例库和 CLI 补充了简体中文。新的语言也会进入 `packs/` 列表和 `api/v1/catalog.json`；若要在界面、独立 API 文本和复制提示词中提供，还需相应扩展界面词典、CLI 和构建器。细节见 [FORMAT.zh-Hans.md](FORMAT.zh-Hans.md)。

若还要将视频翻译成对应语言，可使用 [`01-translate.md`](make-your-own/prompts/zh-Hans/01-translate.md)。

## 添加新领域素材包

1. **先确定术语。** 将 [`02-your-own-field.md`](make-your-own/prompts/zh-Hans/02-your-own-field.md)交给编程 AI。第一步会给出术语列表及每项的核对来源。反复修订，直到愿意将列表展示给同行。一个素材包通常分为 2 或 3 组，共 16 到 24 个术语。
2. **制作示例。** 按同一提示词继续，可以得到 HTML 页面和可自由发布的视频。仅这些成品也可贡献到 `make-your-own/examples/<slug>/<lang>/`。
3. **转为示例库素材包。** 对编程 AI 说：
   ```text
   阅读 FORMAT.zh-Hans.md 和 packs/motion/。把 make-your-own/examples/<slug>/<lang>/index.html
   转成 packs/<pack>/ 下的新素材包。pack.js 每张卡片一个 @element 区块，meta.json
   为英文、简体中文和 <LANGUAGE> 填写 name、meaning、ask、summary、spec、use。
   spec 中的所有数值必须取自代码。使用下一个空闲 order。
   为 tags 保留英文搜索键，在 data/tags.zh-Hans.json 中填写新增键的中文译名。
   运行 node tools/build.mjs、node tools/check.mjs 和 node tools/build-skill.mjs，修复报告的问题。
   ```
4. **检查。** `node tools/build.mjs` 必须无错误完成。用 `node tools/build-skill.mjs --check` 检查离线技能包，用 `node tools/check-skill.mjs` 验证复制安装。`node tools/check.mjs` 在浏览器绘制所有示例，报告异常、空白帧和循环接缝。检查脚本需要 Playwright，安装方法见脚本开头。用 `python3 -m http.server 8765 --bind 127.0.0.1` 启动静态服务，在示例库查看新素材包。
5. **提交拉取请求。** 说明领域、语言、术语来源、不确定的名称和所用字体。

每个素材包都必须提供英文与简体中文。可以先提交草稿并标注不确定的术语，由熟悉领域的人核对。也欢迎补充你的母语版本。

编号按素材包顺序分配。已发布编号不复用、不改变，已发布名称不改名。新素材包的编号排在已有内容之后。

## 许可证

内容按 [MIT 许可证](LICENSE)发布。提交拉取请求 即表示同意以此许可证发布贡献。请只提交你有权授权的作品。

拉取请求 和贡献议题模板要求确认以下四点：

- 作品由你制作，或权利人已允许发布且你说明了许可情况。
- 不含他人的图片、视频、字体、标志或人物素材，或你已说明所获许可。
- 同意按 MIT 许可证发布。
- 理解作品发布后不能撤回该许可。

如果同一作品也出现在你自己的 X 帖子中，请附上 URL，便于确认作者身份。
