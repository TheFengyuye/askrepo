# 演示脚本（录屏用）

> 目的：3 分钟内展示 AskRepo 的核心价值闭环，可作为简历作品集视频或面试演示。

## 环境准备（录屏前）

```bash
npm run cli -- add https://github.com/expressjs/express   # 已索引可跳过
npm run cli -- add https://github.com/prettier/prettier   # 已索引可跳过
npm run build && npm start                                # http://localhost:3000
```

## 脚本（约 3 分钟）

### 1. 开场：首页（10s）
仓库列表：express / prettier / askrepo，各自显示「文件数 · chunks · 状态」。

### 2. 提问 express（60s）
进入 express 问答页，输入：
> **「res.json 方法是怎么实现的？」**

看点：
- 回答**逐字流式**输出
- 精确引用 `[lib/response.js:234-240]`（含行区间解析）
- 点击引用 → 文件查看器打开源码并**高亮对应行**
- 顺带提到 `res.jsonp`（图谱/检索顺藤摸瓜）

### 3. 检索过程（30s）
再次提问：
> **「app.handle 调用了哪些函数处理请求？」**

看点：
- 回答下方显示「检索过程 hop1 follow_graph ...」
- 说明：首轮找到 handle，Agent 沿调用边扩查，带回调用者 `createApplication`

### 4. 代码图谱价值（30s）
提问 prettier：
> **「JS 的打印器在哪里注册？」** 或 **「格式化核心流程在哪个文件？」**

看点：中文问题 → 查询改写（可提到关键词）→ 精确命中 `src/main/core.js` / `src/language-js/printers.js`

### 5. 反馈闭环（10s）
对回答点 👍/👎，说明数据入库供评测集沉淀。

### 6. 收尾（10s）
回到首页 → 添加仓库（演示增量索引秒级完成）→ 项目开源在 GitHub。

## 话术要点

- 「生成代码容易，理解代码难」—— AskRepo 做的是**帮人理解已有代码库**
- 与普通 RAG 的差异：**代码图谱 + Agent 证据链 + 引用可点击验证**
- 工程细节：tree-sitter WASM 零原生构建、增量索引、SSE 流式、评测驱动调优（命中率从 20% 调到 100%/70%）
