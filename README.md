# AskRepo — 代码库智能问答

> 输入任意 GitHub 仓库，自动索引，然后用自然语言提问——回答**带文件级引用和调用链证据**，点击引用即可查看源码。

![Stage](https://img.shields.io/badge/阶段-M4%20打磨发布-2ea44f)
![Stack](https://img.shields.io/badge/TypeScript-全栈-3178c6)
![Node](https://img.shields.io/badge/Node-24%2B-339933)

## 特性

- **混合检索**：BM25 关键词 + 向量语义 + **tree-sitter 代码图谱**（符号/调用边）三路召回，RRF 融合
- **Agent 多跳检索**：首轮检索不足时沿调用链自动扩查（最多 3 跳），回答附带可展开的检索证据链
- **带引用回答**：回答中的 `[file:line]` 引用经证据校验（防幻觉引用），点击即在内置文件查看器中高亮源码
- **中文友好**：LLM 查询改写把中文问题转成英文代码标识符（`dispatch`/`parseurl`/`coreFormat`...），破解「中文问、英文代码」断层
- **代码图谱**：tree-sitter WASM（零原生构建）提取函数/类符号与调用/导入边，支撑「谁调用了 X」类跨文件因果问题
- **增量索引**：重索引时 `git pull` + sha256 对比，只重建变更文件
- **SSE 流式问答**：回答逐字流出，不等待
- **反馈闭环**：点赞/点踩入库，支撑后续评测集沉淀

## 架构

```
浏览器 (Next.js Web UI)
  │ HTTP / SSE
  ▼
Next.js 16 服务（App Router + Turbopack）
  ├── /api/query     检索 + 流式回答（改写 → 三路召回 → Agent 多跳 → LLM 流式）
  ├── /api/repos     仓库管理（索引经子进程异步执行）
  └── /api/repos/[id]/file   内置文件查看器
  │
  ▼
SQLite (node:sqlite + FTS5) —— 向量 BLOB + 关键词 + 代码图谱表
  ▲
索引子进程（node --import tsx cli.ts add）：git clone → 过滤 → chunk →
  bge-m3 嵌入 → tree-sitter 图谱 → 入库
```

- **本地嵌入**：`@huggingface/transformers` 跑 bge-m3（1024 维，可换小模型）
- **LLM**：DeepSeek（OpenAI 兼容 API，provider 可切换）
- 存储层已抽象：SQLite 是 M1-M3 实现，PostgreSQL + pgvector 迁移已列入路线图

## 快速开始

```bash
# 前置：Node.js ≥ 22.5（内置 node:sqlite）
npm install
cp .env.example .env        # 填入 DEEPSEEK_API_KEY（https://platform.deepseek.com）
                            # 国内网络把 HF_ENDPOINT 换成 https://hf-mirror.com

# CLI 方式
npm run cli -- add https://github.com/expressjs/express
npm run cli -- ask express "res.json 方法是怎么实现的？"

# Web 方式
npm run dev                 # 或 npm run build && npm start
# 打开 http://localhost:3000 → 添加仓库 → 问答
```

## 评测

| 仓库 | 检索命中率 (top-8) | 说明 |
|---|---|---|
| expressjs/express (v5) | **10/10 = 100%** | golden 校准到 v5 仓库内可回答问题 |
| AskRepo 自身（dogfood） | **8/8 = 100%** | 用 AskRepo 理解 AskRepo |
| samples/demo-lib | **4/4 = 100%** | 最小冒烟 |
| prettier/prettier | **60–80%（均值 ~70%）** | 改写非确定性波动；桶文件/入口类问题最硬 |

完整明细见 [`docs/EVAL.md`](docs/EVAL.md)（`npm run eval:all` 重新生成）。
设计文档与检索调优全过程见 [`docs/DESIGN.md`](docs/DESIGN.md)。

## CLI 命令

| 命令 | 说明 |
|---|---|
| `add <url\|local-path>` | 克隆 + 增量索引（含代码图谱） |
| `list` | 仓库列表与状态 |
| `ask <repo> <问题>` | 带引用的回答（含检索过程） |
| `search <repo> <问题> [k]` | 只检索，不出回答（调试） |
| `eval <repo> <golden.json>` | 命中率评测 |
| `remove <repo>` | 删除仓库及数据 |

## Docker

```bash
docker compose up -d --build   # http://localhost:3000
# 数据在 ./data（volume 持久化），首次运行会自动下载 bge-m3 模型
```

## 技术栈

TypeScript 全栈 · Next.js 16 (Turbopack) · SQLite/FTS5 · tree-sitter (WASM) ·
@huggingface/transformers (bge-m3) · DeepSeek API · SSE 流式 · Docker

## 路线图

- [x] M1 CLI 最小闭环 + 检索质量评测
- [x] M2 Next.js Web 产品化（SSE 流式 / 文件查看器 / 反馈）
- [x] M3 深度：代码图谱 / 混合检索 RRF / Agent 多跳 / 增量索引
- [ ] M3 余项：反馈→golden 集沉淀、PostgreSQL+pgvector 迁移
- [ ] M4：CI / 演示视频 / 开源发布
