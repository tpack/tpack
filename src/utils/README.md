# TUtils
TUtils 提供了大量 Node.js 开发必备的工具组件，比如命令行、网络库、文件操作等。

## 特性
1. 【强大】**30+** 个组件(**可单独引用**)，顶 **140+** 个 NPM 依赖；
2. 【轻量】所有源码不超过 **350K**（含注释），无外部依赖；
3. 【性能】几乎所有组件在性能上稳超 NPM 社区组件；
4. 【稳定】大量的单元测试(覆盖率 **90%+**)和生产实践，测试用例和社区同步；
5. 【文档】完美全中文文档，VSCode/WebStorm/VS 等可智能提示。

## 为什么要重做轮子
1. NPM 组件为了照顾所有用户的需求，往往提供很多冗余的功能，增加了复杂度、降级了性能，而 TUtils 会帮用户决定，只保留一种性价比最高的方案；
2. NPM 组件风格不一，命名无规律，每次用都要翻文档。TUtils 所有组件遵循同一规范，可以举一反三，过目不忘；
3. NPM 上有大量功能相似的组件被同时依赖，写个 Hello World 都要依赖几十个包；
4. NPM 上有很多历史遗留代码(比如为了支持低版本 Node)，TUtils 只考虑 Node 最新稳定版(LTS)，以确保既轻量又高效；
5. 很多 NPM 组件对中日韩文支持不好。

NPM 社区是开放的，也产生了很多优秀的组件；TUtils 则相对封闭，以保障组件的质量和体验。这类似于开放的安卓和封闭的苹果之间的区别。

## 用法
使用 NPM 安装：
```bash
npm install tutils --save
```

> 注意：TUtils 基于 ES2018 编写，仅支持 Node v10.12 或更高版本，部分组件可能不兼容低版本。

可以一行代码引用所有组件：
```js
const tutils = require("tutils")
```

也可以单独引入某个组件，比如：
```js
const fs = require("tutils/fileSystemSync")
```

## API 文档
[点击查看生成的 API 文档](https://tpack.github.io/tutils/globals.html)

## 组件列表

### 目录
- 文件操作
	- [fileSystem](#filesystem)：文件操作（异步）
	- [fileSystemSync](#filesystemsync)：文件操作（同步）
	- [memoryFileSystem](#memoryfilesystem)：文件操作（内存模拟）
	- [fileSystemWatcher](#filesystemwatcher)：监听
	- [matcher](#matcher)：通配符
	- [path](#path)：路径计算
- 网络
	- [request](#request)：发送 HTTP/HTTPS 请求
	- [httpServer](#httpserver)：HTTP 服务器封装
	- [webSocket](#websocket)：WebSocket 服务端和客户端
	- [url](#url)：地址计算
- 进程
	- [process](#process)：进程操作
	- [vm](#vm)：JS 沙盒
	- [workerPool](#workerpool)：线程池
- 命令行
	- [ansi](#ansi)：命令行颜色、格式
	- [commandLine](#commandline)：命令行操作
	- [logger](#logger)：日志记录器
- 编码、解析
	- [base64](#base64)：Base64 和 DataURI 编码
	- [crypto](#crypto)：MD5 和 SHA-1 加密
	- [html](#html)：HTML 编码和解码
	- [js](#js)：JS 编码和解码
	- [json](#json)：JSON 编码和解码
	- [css](#css)：CSS 编码和解码
	- [esm](#esm)：ES6 模块代码转 CommonJS
- 生成代码
	- [lineColumn](#linecolumn)：行列号和索引换算
	- [sourceMap](#sourcemap)：读写源映射（Source Map）
	- [textWriter](#textwriter)：字符串拼接和生成源映射（Source Map）
	- [textDocument](#textdocument)：字符串编辑和生成源映射（Source Map）
- 异步
	- [asyncQueue](#asyncqueue)：串行执行多个异步任务
	- [deferred](#deferred)：同时等待多个异步任务
	- [eventEmitter](#eventemitter)：支持异步的事件触发器
- 其它
	- [misc](#misc)：其它语言级别的工具函数，比如格式化日期

### 文件操作

#### fileSystem
```js
const { FileSystem } = require("tutils/fileSystem")
const fs = new FileSystem()

await fs.writeFile("foo.txt", "Hello world")
```

npm 组件名                  | TUtils 对应的组件函数
----------------------------|----------------------------------------
`graceful-fs`               | `FileSystem`
`fs-extra`                  | `FileSystem`
`graceful-fs-extra`         | `FileSystem`
`mkdirp`                    | `FileSystem.createDir`
`make-dir`                  | `FileSystem.createDir`
`cp-file`                   | `FileSystem.copFile`
`cpy`                       | `FileSystem.copFile`
`ncp`                       | `FileSystem.copyDir`
`copy-files-tree`           | `FileSystem.copyDir`
`clean-dir`                 | `FileSystem.cleanDir`
`delete`                    | `FileSystem.deleteDir`
`del`                       | `FileSystem.deleteDir`
`rimraf`                    | `FileSystem.deleteDir`, `FileSystem.deleteFile`
`node-glob`                 | `FileSystem.glob`
`fast-glob`                 | `FileSystem.glob`
`globby`                    | `FileSystem.glob`
`glob-all`                  | `FileSystem.glob`
`walker`                    | `FileSystem.walk`
`walkdir`                   | `FileSystem.walk`
`move-file`                 | `FileSystem.moveFile`
`path-exists`               | `FileSystem.existsFile`, `FileSystem.existsDir`

#### fileSystemSync
```js
const fs = require("tutils/fileSystemSync")

fs.writeFile("foo.txt", "Hello world")
```

#### memoryFileSystem
```js
const { MemoryFileSystem } = require("tutils/memoryFileSystem")
const fs = new MemoryFileSystem()
```

npm 组件名                  | TUtils 对应的组件函数
----------------------------|----------------------------------------
`memory-fs`                 | `MemoryFileSystem`
`mem-fs`                    | `MemoryFileSystem`
`memfs`                     | `MemoryFileSystem`

#### fileSystemWatcher
```js
const { FileSystemWatcher } = require("tutils/fileSystemWatcher")

const watcher = new FileSystemWatcher()
watcher.on("change", path => { console.log("Changed", path) })
watcher.on("delete", path => { console.log("Deleted", path) })
watcher.on("create", path => { console.log("Created", path) })
watcher.add(process.cwd(), () => { console.log("Start Watching...") })
```

npm 组件名                  | TUtils 对应的组件函数
----------------------------|----------------------------------------
`chokidar`                  | `FileSystemWatcher`
`gaze`                      | `FileSystemWatcher`
`sane`                      | `FileSystemWatcher`
`watchpack`                 | `FileSystemWatcher`

#### matcher
```js
const matcher = require("tutils/matcher")

matcher.match("/path.js", "/*.js") // true
```

npm 组件名                  | TUtils 对应的组件函数
----------------------------|----------------------------------------
`glob`                      | `Matcher`
`node-glob`                 | `Matcher`
`matcher `                  | `Matcher`, `match`
`minimatch`                 | `match`
`micromatch`                | `match`
`anymatch`                  | `match`
`glob-base`                 | `Matcher.base`
`glob-parent`               | `Matcher.base`
`is-glob`                   | `isGlob`

#### path
```js
const path = require("tutils/path")
```

npm 组件名                  | TUtils 对应的组件函数
----------------------------|----------------------------------------
`rename-extension`          | `setExt`
`changefilesname`           | `setName`
`is-relative`               | `isAbsolutePath`
`is-absolute`               | `isAbsolutePath`
`normalize-path`            | `normalizePath`
`path-is-inside`            | `containsPath`
`contains-path`             | `containsPath`

### 网络

#### request
```js
const request = require("tutils/request")

const html = await request.request("https://www.baidu.com")
console.log(html)
```

npm 组件名         | TUtils 对应的组件函数
-------------------|----------------------------------------
`request`          | `request`
`got`              | `request`
`axios`            | `request`
`wreck`            | `request`
`cookiejar`        | `CookieJar`
`touch-cookiejar`  | `CookieJar`

#### httpServer
```js
const httpServer = require("tutils/httpServer")

const server = new httpServer.HTTPServer({}, (req, res) => {
	res.end(req.href)
})
server.listen(8080)
```

npm 组件名                  | TUtils 对应的组件函数
----------------------------|----------------------------------------
`express`                   | `HTTPServer`
`koa`                       | `HTTPServer`
`http-server`               | `HTTPServer`
`body-parser`               | `HTTPRequest.body`
`cookie-parser`             | `HTTPRequest.cookies`
`cookie-sessions`           | `HTTPServer.sessions`
`multipart`                 | `HTTPRequest.files`

#### webSocket
```js
const webSocket = require("tutils/webSocket")

const server = new webSocket.WebSocketServer("ws://localhost:8080")
server.start()
server.on("connection", ws => {
	ws.send("hello")
})

const client = new webSocket.WebSocket("ws://localhost:8080")
client.on("message", data => {
	console.log(data)
	client.send("hello")
})
```

npm 组件名                  | TUtils 对应的组件函数
----------------------------|----------------------------------------
`ws`                        | `WebSocket`
`websocket-driver`          | `WebSocket`

#### url
```js
const url = require("tutils/url")
```

npm 组件名                  | TUtils 对应的组件函数
----------------------------|----------------------------------------
`resolve-pathname`          | `resolveURL`
`relative-url`              | `relativeURL`
`normalize-url`             | `normalizeURL`
`is-relative-url`           | `isAbsoluteURL`
`get-urls`                  | `replaceURL`
`linkify-it`                | `replaceURL`

### 进程

#### process
```js
const process = require("tutils/process")
```

npm 组件名                  | TUtils 对应的组件函数
----------------------------|----------------------------------------
`cross-spawn`               | `exec`
`execa`                     | `exec`
`open`                      | `open`
`signal-exit`               | `onExit`, `offExit`

#### vm
```js
const vm = require("tutils/vm")
vm.runInVM(`var x = 1`)
```

#### workerPool
```js
const { WorkerPool } = require("tutils/workerPool")

const pool = new WorkerPool(([x, y]) => x + y)
await pool.exec("sum", [1, 2]) // 3
```

npm 组件名                  | TUtils 对应的组件函数
----------------------------|----------------------------------------
`worker-threads-pool`       | `WorkerPool`

### 命令行

#### ansi
```js
const ansi = require("tutils/ansi")
```

npm 组件名                  | TUtils 对应的组件函数
----------------------------|----------------------------------------
`ansi-color`                | `color`
`ansi-colors`               | `color`
`chalk`                     | `bold`, `color`, `backgroundColor`
`kleur`                     | `bold`, `color`, `backgroundColor`
`ansi-style-codes`          | `ANSIColor`
`ansi-regex`                | `ansiCodeRegExp`
`strip-ansi`                | `removeANSICodes`
`strip-color`               | `removeANSICodes`
`ansi-stripper`             | `removeANSICodes`
`cli-truncate`              | `truncateString`
`ansi-color-table`          | `formatTable`
`chunk-text`                | `wrapString`
`wrap-ansi`                 | `wrapString`
`cli-columns`               | `formatList`
`console-log-tree`          | `formatTree`
`ansi-color-table`          | `formatTable`
`columnify`                 | `formatTable`
`formatter-codeframe`       | `formatCodeFrame`
`ansicolor`                 | `ansiToHTML`
`ansi-to-html`              | `ansiToHTML`
`ansi-html`                 | `ansiToHTML`
`stream-ansi2html`          | `ansiToHTML`
`string-width`              | `getStringWidth`
`monospace-char-width`      | `getCharWidth`

#### commandLine
```js
const commandLine = require("tutils/commandLine")
```

npm 组件名                  | TUtils 对应的组件函数
----------------------------|----------------------------------------
`show-terminal-cursor`      | `showCursor`
`hide-terminal-cursor`      | `hideCursor`
`cli-cursor`                | `showCursor`, `hideCursor`
`restore-cursor`            | `showCursor`
`meow`                      | `parseCommandLineArguments`, `formatCommandLineOptions`
`yargs`                     | `parseCommandLineArguments`, `formatCommandLineOptions`
`clear-cli`                 | `clear`
`node-console-input`        | `input`

### `logger`
```js
const { Logger } = require("tutils/logger")
const logger = new Logger()

logger.error("Hello world")
```

npm 组件名                  | TUtils 对应的组件函数
----------------------------|----------------------------------------
`logger`                    | `Logger`
`fancy-log`                 | `Logger`

### 编码、解析

#### base64
```js
const base64 = require("tutils/base64")
```

npm 组件名                  | TUtils 对应的组件函数
----------------------------|----------------------------------------
`js-base64`                 | `encodeBase64`, `decodeBase64`
`data-urlse`                | `encodeDataURI`, `decodeDataURI`

#### crypto
```js
const crypto = require("tutils/crypto")
```

npm 组件名                  | TUtils 对应的组件函数
----------------------------|----------------------------------------
`md5`                       | `md5`
`sha1`                      | `sha1`

#### html
```js
const html = require("tutils/html")
```

npm 组件名                  | TUtils 对应的组件函数
----------------------------|----------------------------------------
`ent`                       | `encodeHTML`, `decodeHTML`
`entities`                  | `encodeHTML`, `decodeHTML`
`he`                        | `encodeHTML`, `decodeHTML`
`html-entities`             | `encodeHTML`
`decode-html`               | `decodeHTML`
`html-decoder`              | `decodeHTML`
`html-entity-decoder`       | `decodeHTML`
`html-encoder-decoder`      | `encodeHTML`, `decodeHTML`
`html-parser`               | `parseHTML`

#### js
```js
const js = require("tutils/js")
```

npm 组件名                  | TUtils 对应的组件函数
----------------------------|----------------------------------------
`js-string-escape`          | `encodeJS`

#### json
```js
const json = require("tutils/json")
```

npm 组件名                  | TUtils 对应的组件函数
----------------------------|----------------------------------------
`strip-json-comments`       | `normalizeJSON`
`load-json-file`            | `readJSON`
`write-json-file`           | `writeJSON`

#### css
```js
const css = require("tutils/css")
```

npm 组件名                  | TUtils 对应的组件函数
----------------------------|----------------------------------------
`cssesc`                    | `encodeCSS`

#### esm
```js
const { transformESModuleToCommonJS } = require("tutils/esm")
```

npm 组件名                  | TUtils 对应的组件函数
----------------------------|----------------------------------------
`esm`                       | `transformESModuleToCommonJS`

### 生成代码

#### lineColumn
```js
const lineColumn = require("tutils/lineColumn")
```

npm 组件名                  | TUtils 对应的组件函数
----------------------------|----------------------------------------
`find-line-column`          | `indexToLineColumn`, `lineColumnToIndex`
`lines-and-columns`         | `LineMap`

#### sourceMap
```js
const sourceMap = require("tutils/sourceMap")

const map = new sourceMap.SourceMapBuilder({ /* 已存在的 map*/ })
map.addMapping(1, 2)
const output = map.toJSON() // 生成的新 map
```

npm 组件名                  | TUtils 对应的组件函数
----------------------------|----------------------------------------
`source-map`                | `SourceMapBuilder`
`convert-source-map`        | `SourceMapBuilder`
`merge-source-map`          | `SourceMapBuilder.applySourceMap`

#### textWriter
```js
const { TextWriter, SourceMapTextWriter } = require("tutils/textWriter")
```

npm 组件名                  | TUtils 对应的组件函数
----------------------------|----------------------------------------
`string-builder`            | `TextWriter`
`source-list-map`           | `SourceMapTextWriter`
`fast-sourcemap-concat`     | `SourceMapTextWriter`

#### textDocument
```js
const { TextDocument, replace, insert } = require("tutils/textDocument")

const data = replace({
	content: "var a = 1",
	path: "source.js"
}, /\bvar\b/g, "let")
console.log(data.content)
console.log(data.sourceMap)
```

npm 组件名                  | TUtils 对应的组件函数
----------------------------|----------------------------------------
`magic-string`              | `TextDocument`

### 异步

#### asyncQueue
```js
const { AsyncQueue } = require("tutils/asyncQueue")

const asyncQueue = new AsyncQueue()
await asyncQueue.then(async () => { /* 异步操作 1 */ })
await asyncQueue.then(async () => { /* 异步操作 2 */ })
await asyncQueue.then(async () => { /* 异步操作 3 */ })
```

npm 组件名                  | TUtils 对应的组件函数
----------------------------|----------------------------------------
`asyncqueue`                | `AsyncQueue`
`node-asyncqueue`           | `AsyncQueue`

#### deferred
```js
const { Deferred } = require("tutils/deferred")

const deferred = new Deferred()
deferred.reject()
setTimeout(() => {
	deferred.resolve()
}, 2000)

await deferred
```

npm 组件名                  | TUtils 对应的组件函数
----------------------------|----------------------------------------
`deferred`                  | `Deferred`

#### eventEmitter
```js
const { EventEmitter } = require("tutils/eventEmitter")

const events = new EventEmitter()
events.on("error", data => console.log(data))  // 绑定 error 事件
await events.emit("error", "hello")            // 触发 error 事件，输出 hello
```

npm 组件名                  | TUtils 对应的组件函数
----------------------------|----------------------------------------
`events`                    | `EventEmitter`
`tappable`                  | `EventEmitter`

### 其它

#### misc
```js
const misc = require("tutils/misc")
```

npm 组件名                  | TUtils 对应的组件函数
----------------------------|----------------------------------------
`strip-bom`                 | `stripBOM`
`sorted-array-type`         | `insertSorted`
`escape-string-regexp`      | `escapeRegExp`
`format-date`               | `formatDate`
`dateformat`                | `formatDate`
`Moment.js`                 | `formatDate`
`node-dateformate`          | `formatDate`
`pretty-hrtime`             | `formatHRTime`
`pretty-time`               | `formatHRTime`
`pretty-bytes`              | `formatSize`
`pretty-size`               | `formatSize`