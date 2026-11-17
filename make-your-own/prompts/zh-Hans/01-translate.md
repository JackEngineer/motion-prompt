# 提示词 1：制作其他语言版本

适用于能够读取本仓库的编程 AI，如 Claude Code、Codex、Cursor。替换 `<LANGUAGE>` 和 `<lang>`，例如 `简体中文` 和 `zh-Hans`。

```text
阅读本仓库的中文制作指南 make-your-own/README.zh-Hans.md。使用英文镜头运动 HTML 作为翻译来源，路径为 make-your-own/examples/camera-moves/en/index.html。

目标：为三个镜头运动视频制作 <LANGUAGE> 版本。

1. 将 make-your-own/examples/camera-moves/en/index.html 复制到
   make-your-own/examples/camera-moves/<lang>/index.html。
2. 只翻译屏幕上显示的文字：
   - PAGES（页标题）和 ITEMS（名称与一句话说明）
   - drawPage() 中的标题文字
   - 卡片内的小标签，搜索 Quiet、LOUD、Audio、Video
   不翻译 REC、24mm、1.7m/s 等 HUD 读数。
3. 不改变布局、颜色、时序或 CELLS 中的绘制代码。
4. 对 24 个名称逐一采用 <LANGUAGE> 影视行业实际使用的术语。
   逐项核实，可以联网时搜索。某些语言保留 Dolly zoom、J-cut 等英文名称；
   遇到这种情况保留英文，不要生硬直译。列出不确定的名称。
5. 如果 <LANGUAGE> 需要其他字体，如中日韩文、阿拉伯文或泰文，
   将字体常量 JP / EN / MONO 改成本机已安装字体，并说明使用了哪种字体。
   如果文字从右向左书写，在修改布局前先告诉我。
6. 检查文字是否放得下。名称必须在 539px 宽的卡片内保持单行。
   过长时先选择更短且通用的术语；缩小字号是最后手段，且必须统一调整全部 24 个名称。
7. 渲染并检查：
     cd make-your-own && node render.mjs examples/camera-moves/<lang>/index.html --all --sheet
   亲自打开 out/ 下的三张接触表，确认没有文字截断、重叠或缺字方框。
8. 交付：以表格列出 24 个名称（英文 -> <LANGUAGE>），注明不确定项和所用字体。
```

也可按同一流程翻译动态图形原版。[原版 HTML（日文）](../../examples/motion-graphics/ja/index.html)它的屏幕文字位于 `SERIES`、`PAGES`、`ITEMS` 和卡片中的少量示例词。

若还要将译名加入 `packs/` 列表，请参阅[贡献指南](../../../CONTRIBUTING.zh-Hans.md)。
