# 第三方声明

第三方许可证原文保留在[第三方声明原文（英文）](THIRD-PARTY-NOTICES.md)。项目许可证另见 [MIT 许可证（英文）](LICENSE)。

## 原项目来源

本仓库是 [showheyohtaki/motion-prompt](https://github.com/showheyohtaki/motion-prompt) 的简体中文汉化版。原作者为 Shohei Ohtaki，原项目的术语库、动态示例和基础实现采用 MIT 许可证。本仓库由 [JackEngineer](https://github.com/JackEngineer/motion-prompt) 维护汉化与中文离线交付修改，保留原版权声明和许可证全文。本版不代表原作者发布或背书。

## Lucian UX/UI Prompt

将动态示例库与代理技能结合的想法，以及技能文档的大体结构（命令表、工作流、规则、故障排查）、CLI 命令集合（`search`、`list`、`get`、`info`、退出码和三个环境变量）、静态数据文件布局，参考了 [Lucian UX/UI Prompt](https://lucianlabs.dev/uxui-prompt/) 及其技能 [Seokwoooo/lucian-uxui](https://github.com/Seokwoooo/lucian-uxui)。仓库未包含 Lucian 的元素、样式或脚本。原文件保留其 MIT 许可证全文以示致谢。

## 社区案例中的帖子

`found.html` 通过 X 官方嵌入展示他人的帖子。帖子正文、图片和视频归其作者所有，不受本仓库 MIT 许可证覆盖。仓库仅保存帖子 ID、URL 及本站撰写的一句话介绍，位于 `examples/found.json`。收录不表示作者为本站背书。本仓库受理其收录内容的删除或更正。[删除或更正申请表](https://github.com/JackEngineer/motion-prompt/issues/new?template=3-removal.yml)

## 运行时工具

`make-your-own/render.mjs` 使用 Playwright（Apache-2.0，通过 npm 安装）和单独安装的 ffmpeg；`tools/check.mjs` 也使用 Playwright。这些工具不随仓库重新分发。自制示例使用渲染机器已有的字体。若素材包附带字体，其许可证随字体一起分发。
