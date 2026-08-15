# AskRepo

> 代码库智能问答：输入 GitHub 仓库地址，自动索引，然后用自然语言提问，得到**带文件级引用**的回答。

**当前阶段：M1 最小闭环（CLI）** · 完整设计见 [`docs/DESIGN.md`](docs/DESIGN.md)

## 快速开始

```bash
npm install
cp .env.example .env   # 填入 DEEPSEEK_API_KEY
npm run cli -- add https://github.com/sindresorhus/is-odd
npm run cli -- ask is-odd "这个包是做什么的？"
```

## CLI 命令

| 命令 | 说明 |
|---|---|
| `add <url>` | 克隆并索引一个仓库（支持 GitHub URL 或本地路径） |
| `list` | 列出已索引仓库及状态 |
| `ask <repo> <问题>` | 自然语言提问，返回带引用的回答 |
| `search <repo> <问题> [k]` | 只检索不出回答（调试/评测用，不需要 API key） |
| `eval <repo> <golden.json>` | 用评测集计算命中率 |

## 里程碑

- [x] M1 最小闭环：CLI 索引 + 混合检索 + 带引用回答（当前）
- [ ] M2 Web 产品化（Next.js 全栈 + SSE 流式）
- [ ] M3 深度（tree-sitter 代码图谱 + Agent 多跳 + 增量索引 + 反馈闭环）
- [ ] M4 打磨发布（评测数字 + Docker 部署 + 开源）

## 技术栈

TypeScript · Node 24（内置 `node:sqlite` + FTS5）· `@huggingface/transformers.js`（本地 bge-m3 嵌入）· DeepSeek API
