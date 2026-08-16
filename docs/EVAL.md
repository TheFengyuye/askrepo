# AskRepo 检索质量评测

> 由 `npm run eval:all` 自动生成（改写器为非确定性 LLM，数字存在运行间波动）。
> 评测方法：golden set 每题命中判定 = 期望文件出现在 top-8 检索证据中（任一匹配即命中）。

| 仓库 | 检索命中率 (top-8) | 说明 |
|---|---|---|
| express | 10/10 = 100% (top-8 evidence) | [docs/golden-express.json] |
| askrepo | 8/8 = 100% (top-8 evidence) | [docs/golden-askrepo.json] |
| demo-lib | 4/4 = 100% (top-8 evidence) | [docs/golden-demo-lib.json] |
| prettier | 7/10 = 70% (top-8 evidence) | [docs/golden-prettier.json] |


## 单次运行明细

### express

```
Running 10 eval questions on expressjs/express (mode=retrieval, topK=8)

   keywords: createApplication, init, app, express, module.exports, Router, use, handle, listen, settings, middleware, stack, route, dispatch
🟢 express 应用对象是怎么创建和初始化的？
   expected: lib/express.js, lib/application.js
   retrieved: lib/express.js, lib/express.js, lib/express.js

   keywords: app.listen, createServer, http.createServer, listen, server.listen, port, callback, net.Server, http.Server, listen method, Node.js, server,
🟢 app.listen 方法是怎么实现的？
   expected: lib/application.js
   retrieved: lib/application.js, Readme.md, lib/express.js

   keywords: res.json, res.json implementation, express response, json method, send, res.send, res.json source, express lib, response.js, json stringify,
🟢 res.json 方法是怎么实现的？
   expected: lib/response.js
   retrieved: lib/response.js, lib/response.js, lib/response.js

   keywords: res.send, Express, response, send, method, implementation, lib, response.js, res.send, sendFile, sendStatus, json, end, writeHead, http.Serv
🟢 res.send 方法的实现在哪里？
   expected: lib/response.js
   retrieved: lib/response.js, lib/response.js, lib/response.js

   keywords: view engine, render, template, res.render, app.set, view, engine, ejs, pug, handlebars, renderFile, view cache, view path
🟢 视图渲染（view engine）相关的逻辑在哪里？
   expected: lib/view.js, lib/application.js
   retrieved: lib/view.js, lib/view.js, lib/view.js

   keywords: req.query, query parser, parseurl, querystring, req.query property, middleware, app.use, route params, Express, request object, query string
🟢 req.query 查询参数属性是在哪里定义的？
   expected: lib/request.js
   retrieved: lib/utils.js, lib/request.js, lib/request.js

   keywords: res.cookie, cookie, set-cookie, response, headers, serialize, express, res, cookie-parser, writeHead, setHeader, cookieOptions
🟢 res.cookie 方法实现在哪个文件？
   expected: lib/response.js
   retrieved: lib/response.js, lib/response.js, lib/response.js

   keywords: ETag, generate, utility, function, file, etag, weak, strong, hash, crypto, createHash, fs, stat, mtime, size
🟢 ETag 生成相关的工具函数在哪个文件？
   expected: lib/utils.js
   retrieved: lib/utils.js, lib/response.js, lib/response.js

   keywords: app.handle, request handler, entry point, Express, app.handle, dispatch, middleware, routing, app.use, app.listen, handleRequest, requestLis
🟢 应用接收请求的入口 app.handle 定义在哪里？
   expected: lib/application.js
   retrieved: lib/express.js, lib/request.js, lib/express.js

   keywords: Router, require, import, module, express, app.use, routing, dispatch, handler, middleware, createApplication, path, route, mount
🟢 路由分发时使用的 Router 对象是从哪里引入的？
   expected: lib/application.js
   retrieved: lib/express.js, lib/express.js, lib/express.js

Retrieval hit rate: 10/10 = 100% (top-8 evidence)

```

### askrepo

```
Running 8 eval questions on askrepo (mode=retrieval, topK=8)

   keywords: hybrid search, AskRepo, hybrid retrieval, vector search, keyword search, BM25, dense retrieval, sparse retrieval, rerank, fusion, combine, s
🟢 AskRepo 的混合检索（hybrid search）是怎么实现的？
   expected: src/retrieval/search.ts
   retrieved: src/retrieval/search.ts, src/retrieval/search.ts, src/retrieval/search.ts

   keywords: query rewriting, model, LLM, rewrite, query, retrieval, rerank, embedding, inference, API, call, prompt, generation
🟢 查询改写（query rewriting）调用的是什么模型？
   expected: src/retrieval/rewrite.ts
   retrieved: src/retrieval/rewrite.ts, src/retrieval/rewrite.ts, src/retrieval/search.ts

   keywords: chunk, split, code splitting, webpack, bundle, module, import, dynamic import, require, loader, chunking, splitChunks, optimization, entry, 
🟢 代码 chunk 是怎么切的？
   expected: src/indexing/chunk.ts
   retrieved: src/indexing/chunk.ts, src/indexing/chunk.ts, src/indexing/chunk.ts

   keywords: embedding, vector, storage, database, index, save, load, serialize, persist, vectorstore, faiss, numpy, file, memory
🟢 嵌入向量（embedding）存在哪里？
   expected: src/storage/db.ts
   retrieved: src/storage/db.ts, src/storage/db.ts, src/storage/db.ts

   keywords: cli, command, entry, main, bin, argv, process.argv, commander, yargs, parse, options, flags, run, execute
🟢 CLI 的命令入口在哪个文件？
   expected: src/cli.ts
   retrieved: src/cli.ts, src/cli.ts, src/cli.ts

   keywords: hit rate, evaluation, calculate, metric, precision, recall, accuracy, scoring, benchmark, compute, formula, result, test, assessment
🟢 评测的命中率是怎么计算的？
   expected: src/eval.ts
   retrieved: src/indexing/indexer.ts, src/answer.ts, src/retrieval/vectors.ts

   keywords: embedding, local, model, sentence-transformers, embed, vector, inference, ONNX, tokenizer, encode, dimension, cache, load, config
🟢 本地嵌入模型用的是什么？
   expected: src/indexing/embed.ts
   retrieved: src/indexing/embed.ts, src/indexing/embed.ts, src/indexing/embed.ts

   keywords: indexing pipeline, process, ingest, index, document, pipeline, processor, bulk, indexer, parse, transform, enrich, output, sink, batch
🟢 索引管道（indexing pipeline）的流程是怎样的？
   expected: src/indexing/indexer.ts
   retrieved: src/indexing/indexer.ts, src/indexing/indexer.ts, src/indexing/indexer.ts

Retrieval hit rate: 8/8 = 100% (top-8 evidence)

```

### demo-lib

```
Running 4 eval questions on demo-lib (mode=retrieval, topK=8)

   keywords: square, function, math, utils, export, module, file, definition, implementation, helper, calculate, arithmetic
🟢 square 函数在哪个文件？
   expected: src/math.ts
   retrieved: src/math.ts, src/index.ts, src/index.ts

   keywords: calculate, function, implementation, arithmetic, computation, return, result, parameters, arguments, math, operation, logic
🟢 calculate 函数是怎么实现的？
   expected: src/index.ts
   retrieved: src/math.ts, src/index.ts, README.md

   keywords: exports, module.exports, function, API, library, index, require, export default
🟢 这个库导出了哪些函数？
   expected: src/math.ts, src/index.ts
   retrieved: src/index.ts, src/math.ts, src/index.ts

   keywords: precision, floating point, rounding, decimal, significant digits, numeric, tolerance, epsilon, double, float, precision loss, round, truncat
🟢 精度处理 precision 相关代码在哪里？
   expected: src/index.ts
   retrieved: src/index.ts, src/index.ts, src/math.ts

Retrieval hit rate: 4/4 = 100% (top-8 evidence)

```

### prettier

```
Running 10 eval questions on prettier/prettier (mode=retrieval, topK=8)

   keywords: prettier, entry file, index.js, bin, cli, main, package.json, module, exports, require, resolve, path
🔴 prettier 的入口文件是哪个？
   expected: src/index.js, src/index.cjs
   retrieved: src/cli/index.js, src/main/front-matter/index.js, src/main/plugins/index.js

   keywords: CLI, command, entry, main, bin, commander, yargs, parse, argv, process.argv, run, execute, start
🟢 CLI 命令的入口在哪里？
   expected: src/cli/index.js
   retrieved: src/cli/index.js, src/cli/index.js, src/cli/index.js

   keywords: core, format, core format, file, module, process, pipeline, core module, format core, core file
🟢 格式化核心流程（core）在哪个文件？
   expected: src/main/core.js
   retrieved: src/main/core.js, src/main/core.js, src/main/core.js

   keywords: AST, transform, doc, generate, parser, visitor, traverse, convert, documentation, codegen, syntax, tree, walk, emit, output
🔴 AST 转 doc 的逻辑在哪里？
   expected: src/main/ast-to-doc.js
   retrieved: src/language-js/traverse/visitor-keys.evaluate.js, src/language-html/parse/ast.js, src/utilities/ast.js

   keywords: parse, entry, parser, parse entry, parse function, parse module, parse call, parse invocation, parse source, parse implementation, parse log
🔴 代码解析（parse）的入口在哪里？
   expected: src/main/parse.js
   retrieved: src/language-js/parse/postprocess/index.js, src/language-js/parse/postprocess/index.js, src/language-js/parse/postprocess/index.js

   keywords: multiparser, dispatch, multilingual, embedded, code, parser, route, handler, language, detect, switch, case, module, function
🟢 多语言嵌入式代码分派（multiparser）在哪？
   expected: src/main/multiparser.js
   retrieved: src/main/multiparser.js, src/main/multiparser.js, src/main/multiparser.js

   keywords: builders, doc, document, builder, file, module, export, require, path, source, directory, index
🟢 doc 构建器（builders）在哪个文件？
   expected: src/document/builders/index.js
   retrieved: src/document/builders/index.js, src/document/builders/fill.js, src/document/utilities/index.js

   keywords: prettier, config, resolveConfig, loadConfig, getConfig, findConfig, configFile, cosmiconfig, search, options
🟢 prettier 配置读取（config）逻辑在哪？
   expected: src/config/prettier-config/index.js
   retrieved: src/config/prettier-config/index.js, src/config/editorconfig/index.js, src/config/prettier-config/index.js

   keywords: babel, parser, parse, @babel/parser, babylon, parseFile, parseCode, AST, tokenizer, options, plugins, sourceType
🟢 JS 的 babel 解析器入口在哪？
   expected: src/language-js/parse/babel.js
   retrieved: src/plugins/babel.js, src/language-js/parse/babel.js, src/language-js/parse/babel.js

   keywords: printers, register, registration, printer, setup, configure, addPrinter, printerManager, printerList, init, initialize, module, export, requ
🟢 JS 打印器（printers）在哪里注册？
   expected: src/language-js/printers.js
   retrieved: src/document/printer/printer.js, src/language-json/printers.js, src/document/printer/print-result.js

Retrieval hit rate: 7/10 = 70% (top-8 evidence)

```

