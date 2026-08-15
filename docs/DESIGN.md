# AskRepo — 代码库智能问答系统（设计文档）

> 状态：设计评审中 · 版本：v0.1 · 作者：个人项目（简历向）
> 一句话：输入任意 GitHub 仓库地址，自动索引，然后用自然语言提问，得到**带文件级引用和调用链证据**的回答。

---

## 0. 项目定位（为什么做这个）

### 0.1 要解决的问题
- 接手/阅读一个陌生仓库时，理解成本极高：「这个功能在哪实现」「鉴权是怎么串起来的」往往要手动跟调用链翻半天。
- 现有的「AI 编程助手」擅长**写代码**，不擅长**讲清楚一个已有代码库**。通用 RAG 问答对代码场景效果差（代码碎片化、符号名无自然语言语义、跨文件依赖强）。
- 2025 年代码大多由 AI 生成，**理解与验证**比**生成**更稀缺——本项目的价值在「帮人理解」，不评判代码好坏，不存在「AI 评审 AI」的同源盲区问题。

### 0.2 核心差异化（面试时讲这三个点）
1. **混合检索**：BM25 关键词 + 向量语义 + **代码图谱**三路召回，RRF 融合——解决「纯向量检索在代码场景符号名失配」的问题。
2. **Agentic 多跳检索**：首轮检索不充分时，沿调用/导入边自动扩查，最终回答带**完整证据链**（不是一次性 prompt，是检索 agent）。
3. **质量闭环**：golden set 评测集 + 人工反馈回流，用数字证明检索质量，而不是「感觉还行」。

### 0.3 不做什么（范围边界）
- 不做代码生成、不做代码评审、不做 IDE 插件（保持独立可演示的全栈 Web 产品形态）。
- 不做多租户 SaaS（单机/单用户即可，控制复杂度，应届生项目重点是**深度**不是广度）。

---

## 1. 目标用户与使用场景

| 用户 | 场景 |
|---|---|
| 开发者（核心） | 入职新团队/接手新仓库：「这个项目的支付回调在哪？」「登录态是怎么传递的？」 |
| 开源贡献者 | 提 PR 前快速理解项目结构：「我应该改哪个文件？」 |
| 面试准备者 | 研究开源项目源码：「这个框架的核心抽象是什么？」 |
| 自己（dogfood） | 用 AskRepo 理解 AskRepo 自己的代码 —— 演示素材 |

**演示脚本（录屏用）**：输入一个 GitHub 仓库（如 `expressjs/express`）→ 看到索引进度 → 提问「请求进来后是如何被路由分发的？」→ 流式回答 + 引用高亮 → 点击引用跳转到文件对应行。

---

## 2. 功能需求

### MVP（M1 + M2）
- [ ] 添加仓库（URL）→ 后台克隆 → 异步索引 → 状态可视化
- [ ] 自然语言提问 → 流式回答（SSE）→ 引用锚点 `[file:line]`
- [ ] 内置文件查看器：点击引用，高亮对应代码行
- [ ] 回答点赞/点踩反馈

### V2（M3）
- [ ] 代码图谱（符号 + 调用/导入边）与图谱检索
- [ ] Agentic 多跳检索（沿调用链自动扩查）
- [ ] 增量索引（git fetch + 只重建变更文件）
- [ ] 多轮对话上下文

### V3（远期，可选）
- [ ] 检索质量评测后台（golden set + 指标报表）
- [ ] 多 LLM provider 切换界面
- [ ] 私有 GitLab/Bitbucket 支持

---

## 3. 系统架构

```
┌───────────────────────────── 浏览器 ─────────────────────────────┐
│  Next.js 前端：仓库管理 / 问答页(流式+引用) / 文件查看器 / 反馈      │
└──────────────────────────────────────────────────────────────────┘
                                │ HTTP / SSE
┌────────────────────────────── ▼ ────────────────────────────────┐
│                        Next.js API 层                            │
│  POST /api/repos · POST /api/query(SSE) · /api/feedback · ...    │
└───────────────┬──────────────────────────────┬──────────────────┘
                │ 入队                          │ 查询
┌───────────────▼──────────────┐   ┌────────────▼─────────────────┐
│  Worker 进程 (BullMQ + Redis) │   │  检索服务（API 层内联）        │
│  索引管道：clone → 解析 →      │   │  BM25 + 向量 + 图谱 → RRF      │
│  chunk → 建图 → embed → 入库  │   │  → Agent 多跳 → LLM 生成回答   │
└───────────────┬──────────────┘   └────────────┬─────────────────┘
                │                               │
┌───────────────▼───────────────────────────────▼─────────────────┐
│         PostgreSQL 16 + pgvector + tsvector（单一数据源）         │
│  repositories / files / chunks(embedding) / symbols / edges /    │
│  questions / feedback                                            │
└──────────────────────────────────────────────────────────────────┘
```

- **单仓库单应用**：Next.js 同时承担前端与 API；索引管道跑在独立 Worker 进程（CPU/IO 密集，不阻塞 Web）。
- **存储一把梭**：向量（pgvector/HNSW）与全文检索（tsvector）都放 PostgreSQL，不引入 Elasticsearch/向量库，降低部署复杂度。
- **LLM 抽象**：provider 接口，默认 DeepSeek（便宜），可切 OpenAI/Anthropic；Embedding 默认本地 `bge-m3`（免费、中英代码都强），可切 API。

---

## 4. 技术选型

| 层 | 选型 | 理由 |
|---|---|---|
| 语言 | TypeScript 全栈 | 一套语言到底；全栈/前端岗位最通用；类型安全适合复杂数据流 |
| 前端 | Next.js (App Router) + Tailwind + shadcn/ui | 前后端同仓库；流式用 SSE 原生支持；UI 快速成型 |
| 后端 | Next.js API Routes + 独立 Worker | 轻量；Worker 用 BullMQ 管理任务队列 |
| 任务队列 | Redis + BullMQ | 索引任务异步化；进度可追踪；业界标准 |
| 数据库 | PostgreSQL 16 + pgvector + tsvector | 向量 + 全文 + 关系三合一；单机 Docker 部署简单 |
| 代码解析 | tree-sitter（多语言） | 精确 AST → 高质量 chunk 与符号提取；支持 20+ 语言 |
| Embedding | bge-m3（本地，1024 维）/ 可切 API | 免费、代码语义强；本地跑不依赖外部额度 |
| LLM | provider 抽象：DeepSeek 默认 / OpenAI / Anthropic | 便宜可测；简历上写「多 provider 抽象」是加分点 |
| 部署 | Docker Compose（web + worker + postgres + redis） | 一键起；线上 Demo 稳定 |

---

## 5. 核心设计

### 5.1 索引管道（Indexing Pipeline）

```
clone(--depth 1) → 过滤(gitignore/二进制/vendored) → 语言检测
      → tree-sitter AST → 产出两样东西：
        ① Chunks：按语义单元切块（函数/类/块），带文件/行号/所属符号元数据
        ② Symbols + Edges：函数/类/变量节点，调用/导入/引用边（代码图谱）
      → 每 chunk 生成 embedding → 写入 PostgreSQL
      → 建立 tsvector 全文索引（符号名、标识符权重高）
```

- **Chunk 策略**：以 AST 语义单元为界（不是固定长度硬切），函数内部过长再按语句块拆分；保留 `start_line/end_line/symbol`。
- **增量索引（M3）**：文件级 sha256 去重；`git fetch` 后 diff，只重建变更文件、删除失效 chunk/符号。
- **大仓库防护**：默认限制仓库体积（如 ≤ 200MB）、跳过 vendored 目录（`vendor/`、`node_modules` 等）。

### 5.2 代码图谱（Code Graph）

- 节点 = 符号（函数/类/方法/变量/导入），边 = `calls / imports / defines / references`。
- 存 PostgreSQL 邻接表即可（`symbols` + `symbol_edges`），不引入图数据库——控制复杂度，数据量（单仓库百万级边）完全扛得住。
- 用途：① 图谱检索扩查；② 引用解析（回答中直接给出「谁调用了它」）。

### 5.3 混合检索（Hybrid Retrieval）

查询时**三路并行召回**，再融合：

| 路 | 手段 | 解决什么 |
|---|---|---|
| ① 向量 | chunk.embedding 余弦相似度 (HNSW) | 语义相近：「支付流程」→ 找到 `payment` 相关实现 |
| ② 关键词 | tsvector + 符号名权重高 | 符号名精确匹配：「`verifyJwt` 在哪定义」 |
| ③ 图谱 | 从 ①② 命中的 chunk 出发，沿调用/导入边扩散 1~2 跳 | 找回「调用它的函数」「它调用的函数」——跨文件因果链 |

→ **RRF（Reciprocal Rank Fusion）** 合并三路排名 → 按文件聚合去重 → 取 top-k 作为上下文。

### 5.4 Agentic 多跳检索（M3）

```
用户问题
  → 首轮混合检索
  → 置信度评估（得分阈值 / 检索覆盖度）
  → 不充分时进入 agent 循环（最多 N=3 跳）：
      动作集：follow_graph(symbol) 沿调用边查上下游
             read_file(path)       读整个文件
             search_symbol(name)   精确符号查找
      每步动作与结果写入 trace（证据链）
  → 汇总所有证据 → LLM 生成带引用的最终回答
```

- 每一跳的输入输出都进 `trace`，前端可展开查看「AI 是怎么找到答案的」——**这是演示与面试的核心亮点**。

### 5.5 回答与引用

- 生成时要求 LLM 的回答引用上下文中的 chunk 锚点 `[file:line]`。
- 引用经后端校验（锚点必须存在于检索证据中，防止幻觉引用）后才下发前端。
- 前端内置文件查看器：点击引用 → 打开文件 → 高亮对应行（高亮区间来自引用元数据，非 LLM 编造）。

### 5.6 反馈闭环（M3）

点赞/点踩 + 可选纠错文本 → 写入 `feedback` → 沉淀为 golden set（人工标注「问题→理想答案→应命中文件」）→ 用于检索质量评测（Recall@k、命中文件准确率）→ 驱动后续优化。**有数字的质量故事，是简历项目稀缺的深度。**

---

## 6. 数据模型（PostgreSQL DDL 草案）

```sql
-- 仓库
CREATE TABLE repositories (
  id             BIGSERIAL PRIMARY KEY,
  url            TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,                      -- owner/repo
  default_branch TEXT NOT NULL DEFAULT 'main',
  status         TEXT NOT NULL DEFAULT 'pending',    -- pending|cloning|indexing|ready|failed
  error          TEXT,
  file_count     INT  NOT NULL DEFAULT 0,
  chunk_count    INT  NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 文件
CREATE TABLE files (
  id         BIGSERIAL PRIMARY KEY,
  repo_id    BIGINT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  path       TEXT NOT NULL,
  language   TEXT,
  sha256     TEXT NOT NULL,
  size_bytes INT  NOT NULL DEFAULT 0,
  indexed_at TIMESTAMPTZ,
  UNIQUE (repo_id, path)
);

-- 代码块（含向量；维度取决于 embedding 模型，bge-m3=1024）
CREATE TABLE chunks (
  id         BIGSERIAL PRIMARY KEY,
  repo_id    BIGINT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  file_id    BIGINT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  start_line INT NOT NULL,
  end_line   INT NOT NULL,
  symbol     TEXT,                                   -- 所属函数/类名
  embedding  vector(1024)
);
CREATE INDEX idx_chunks_repo       ON chunks (repo_id);
CREATE INDEX idx_chunks_embedding  ON chunks USING hnsw (embedding vector_cosine_ops);

-- 代码图谱：符号节点
CREATE TABLE symbols (
  id        BIGSERIAL PRIMARY KEY,
  repo_id   BIGINT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  file_id   BIGINT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  name      TEXT NOT NULL,
  kind      TEXT NOT NULL,                           -- function|class|method|variable|import
  signature TEXT,
  line      INT NOT NULL
);
CREATE INDEX idx_symbols_repo_name ON symbols (repo_id, name);

-- 代码图谱：边
CREATE TABLE symbol_edges (
  id        BIGSERIAL PRIMARY KEY,
  repo_id   BIGINT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  source_id BIGINT NOT NULL REFERENCES symbols(id) ON DELETE CASCADE,
  target_id BIGINT NOT NULL REFERENCES symbols(id) ON DELETE CASCADE,
  kind      TEXT NOT NULL                            -- calls|imports|defines|references
);
CREATE INDEX idx_edges_repo        ON symbol_edges (repo_id, source_id);
CREATE INDEX idx_edges_repo_target ON symbol_edges (repo_id, target_id);

-- 问答记录
CREATE TABLE questions (
  id         BIGSERIAL PRIMARY KEY,
  repo_id    BIGINT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  question   TEXT NOT NULL,
  answer     TEXT NOT NULL,
  citations  JSONB NOT NULL DEFAULT '[]',            -- [{file, start_line, end_line, chunk_id}]
  trace      JSONB,                                  -- agent 证据链
  latency_ms INT,
  model      TEXT,
  rating     SMALLINT,                               -- -1 点踩 / 1 点赞
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 反馈
CREATE TABLE feedback (
  id         BIGINT PRIMARY KEY REFERENCES questions(id) ON DELETE CASCADE,
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

> 迁移工具：`drizzle-orm` + `drizzle-kit`（TS 生态、类型安全、迁移文件可追踪）。

---

## 7. API 设计

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/repos` | `{url}` → 202 `{repo_id}`，创建索引任务 |
| GET | `/api/repos` | 仓库列表 + 索引状态/统计 |
| GET | `/api/repos/:id` | 仓库详情（文件数、chunk 数、状态、错误） |
| POST | `/api/repos/:id/refresh` | 触发增量重建 |
| DELETE | `/api/repos/:id` | 删除仓库及其全部数据 |
| POST | `/api/query` | `{repo_id, question, conversation_id?}` → **SSE 流式**：`delta` 文本 → `done`（含 citations + trace） |
| POST | `/api/feedback` | `{question_id, rating, note?}` |
| GET | `/api/repos/:id/file?path=...` | 文件内容（供内置查看器） |
| GET | `/api/health` | 健康检查 |

---

## 8. 前端设计（Next.js）

| 路由 | 页面 | 要点 |
|---|---|---|
| `/` | 仓库列表 | 添加仓库表单、索引状态徽章、失败原因 |
| `/repos/:id` | 仓库详情 | 索引进度、统计卡片（文件数/chunk 数/语言分布） |
| `/chat/:repoId` | **问答页（核心）** | 提问框；流式回答；引用锚点可点击；右侧文件查看器高亮；反馈按钮；可展开「检索过程」（trace） |
| `/settings` | 设置 | LLM provider / API key / embedding 模型（环境变量为主，页面可选） |

---

## 9. 里程碑与时间线（时间灵活，每步可演示）

| 阶段 | 内容 | 时长 | 验收标准 |
|---|---|---|---|
| **M1 最小闭环** | CLI 版：clone → 索引(chunk+embed) → `askrepo ask "问题"` → 带引用回答 | 1–2 周 | 对 3 个真实仓库各问 20 题，人工评估「找到正确位置」命中率 ≥ 70% |
| **M2 产品化** | Next.js 全栈：仓库管理 + 任务队列 + 问答页(SSE 流式) + 文件查看器 + 反馈 | 2–3 周 | 完整演示脚本跑通；部署到线上可访问 |
| **M3 深度** | 代码图谱 + 混合检索 RRF + Agent 多跳 + 增量索引 + 反馈闭环 | 3–4 周 | 对比实验：混合检索 vs 纯向量，命中率提升有数据支撑 |
| **M4 打磨** | golden set 评测 + 指标；Docker Compose 一键部署；README/演示视频；开源发布 | 1–2 周 | 可复现的评测数字；GitHub 仓库结构完整、可 clone 即跑 |

**合计约 2.5–3.5 个月**（按你的灵活时间，可加速/放缓）。M1 是「不后悔阀」：两周内验证核心假设（代码检索质量到底行不行），不行就调整检索策略，而不是写完整个产品才发现。

---

## 10. 简历亮点（做完后的弹药）

1. **混合检索架构**：BM25 + 向量 + 代码图谱三路召回、RRF 融合，解决纯向量检索在代码场景的符号名失配问题（配对比数据）。
2. **Agentic 检索**：沿调用链多跳扩查，自动定位跨文件实现，回答附带完整证据链（可展开查看检索过程）。
3. **工程化**：BullMQ 异步索引管道、增量重建、SSE 流式输出、PostgreSQL 向量+全文+关系一体化存储、Docker Compose 一键部署。
4. **质量闭环**：自建 golden set 评测集 + 人工反馈回流，量化检索命中率与回答准确率——「用数字说话」是简历项目稀缺的深度。

---

## 11. 风险与对策

| 风险 | 对策 |
|---|---|
| 检索质量不达标（最大风险） | M1 就建评测集，用数字验证；不达标先调 chunk 策略/检索权重，不急着堆功能 |
| 大仓库索引慢/成本高 | 体积限制 + vendored 过滤 + 增量索引；embedding 用本地 bge-m3 免费跑 |
| LLM/嵌入 API 成本 | provider 抽象 + 默认 DeepSeek/本地模型；demo 仓库控制在中小规模 |
| 部署复杂导致线上 Demo 不稳定 | Docker Compose 单机；demo 只放 2-3 个预置仓库 |
| 与「人人都会的 RAG 项目」撞车 | 差异化在代码图谱 + Agent 证据链 + 评测闭环，README/演示重点突出这三者 |

---

## 12. 目录结构（单仓库单应用）

```
askrepo/
├── src/
│   ├── app/                    # Next.js App Router（页面 + /api/* 路由）
│   ├── server/
│   │   ├── indexing/           # 克隆/过滤/解析/chunk/embed 入库
│   │   ├── retrieval/          # 三路召回 + RRF 融合
│   │   ├── agent/              # 多跳检索循环（动作集 + trace）
│   │   ├── graph/              # tree-sitter 符号/边提取
│   │   ├── llm/                # provider 抽象（DeepSeek/OpenAI/Anthropic）
│   │   └── db/                 # drizzle schema + migrations
│   ├── worker/                 # BullMQ worker 入口（索引管道）
│   └── lib/                    # 前端共享工具
├── docs/
│   └── DESIGN.md               # 本文档
├── docker-compose.yml          # web + worker + postgres + redis
├── .env.example
└── README.md                   # 项目简介 + 快速开始 + 架构图
```

---

## 13. 已确认决策

1. **项目名**：`AskRepo` ✅
2. **Embedding**：本地 `bge-m3`（1024 维；首次需下载模型，若本机跑不动则降级 `bge-small-*` 或 API，通过 env 切换）✅
3. **默认 LLM**：DeepSeek API（provider 抽象，可切换 OpenAI/Anthropic）✅
4. **M1 验收基准仓库**：`expressjs/express` + 一个中型 TypeScript 开源项目（候选：`eslint/eslint`、`vitejs/vite`）+ 一个自己写的项目 ✅
5. **推进方式**：小步快跑——M1 先出可运行 CLI 最小闭环，用评测集验证检索质量（最大风险），通过后再进入 M2 Web 化
6. **M1 存储适配（工程决策）**：本机无 Docker/PostgreSQL，M1 用 SQLite（Node 内置 `node:sqlite`）+ FTS5 关键词 + 内存精确余弦向量检索（M1 仓库规模完全够），存储层独立封装为接口，M2 切 PostgreSQL+pgvector。**最终架构不变**，只是 M1 的存储实现不同。
