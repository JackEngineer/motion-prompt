# 安装 Motion Prompt 技能

将本地工作区中的整个 `skills/motion-prompt/` 复制到 Claude Code 的 `.claude/skills/` 或 Codex 的 `.agents/skills/`。保留同目录中的 `runtime/`、`scripts/` 和 `references/`。放在项目根目录仅对该项目生效，放在用户主目录可在多个项目中使用。

需要 Node.js 18 或更高版本。将 `<技能目录>` 替换为复制后的实际路径，确认查询可在本地运行。

```sh
node <技能目录>/scripts/motion-prompt.mjs info
node <技能目录>/scripts/motion-prompt.mjs search 打字机
node <技能目录>/scripts/motion-prompt.mjs get 001
node <技能目录>/scripts/motion-prompt.mjs prompt 001
```

说“打开 motion-prompt 资料库”，或运行 `node <技能目录>/scripts/motion-prompt.mjs pick`。点击“选择”并填写可选备注，再点击“发送给 AI”。已知编号时，可直接说“用 #012 制作我的标题动画”。

默认读取本地数据并显示简体中文。要查阅英文或日文，可传入 `--lang en` 或 `--lang ja`。

代理入口见 [SKILL.md](SKILL.md)。实施时序、缓动和署名的细节见[移植说明](references/porting.zh-Hans.md)。英文原版供历史对照。[原版说明（英文）](references/usage.en.md)
