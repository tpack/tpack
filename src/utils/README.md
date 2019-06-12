# TUtils
TUtils 提供了大量 Node.js 开发必备的工具组件，比如网络库、文件操作、解析库等。

## 特性
1. 20+ 个组件，顶 140+ 个 NPM 依赖，可单独引用每个组件；
2. 所有源码不超过 300K，无外部依赖——轻量且高效；
3. 几乎所有组件在性能上稳超 NPM 社区组件；
4. 拥有大量的单元测试以确保稳定性（覆盖率 90%+），测试用例和社区同步；
5. 完美全中文文档，VSCode/WebStorm/VS 等可智能提示。

## 为什么要重做轮子
1. NPM 组件为了照顾所有用户的需求，往往提供很多不常用的功能，增加了复杂度、降级了性能，而 TUtils 会帮用户决定，只保留一种性价比最高的方案；
2. NPM 组件风格不一，命名杂乱，很难全部掌握。TUtils 所有组件遵循同一个规范，可以举一反三，快速上手；
3. NPM 上有大量功能相似的组件被同时依赖，浪费性能、浪费内存和硬盘，也浪费安装和发布时间。
4. 很多 NPM 组件对中日韩文支持不好。

NPM 社区是开放的，也产生了很多优秀的组件，TUtils 则相对封闭，以确保提高组件的质量和体验，这类似于开放的安卓和封闭的苹果之间的区别。

## 用法
使用 NPM 安装：
```bash
npm install tutils --save
```

可以一行代码引用所有组件：
```js
const tutils = require("tutils")
```

也可以单独引入某个组件，比如：
```js
const fs = require("tutils/fileSystemSync")
```

> 注意：TUtils 基于 ES2018 编写，只支持 Node v10.15+，部分组件在低版本可能报错。

## API 文档
[点击查看生成的 API 文档](http://tpack.github.io/tutils/)

## 组件列表

### 目录
- 文件操作
	- [fileSystem](#fileSystem-模块)：文件操作（异步）
	- [fileSystemSync](#fileSystemSync-模块)：文件操作（同步）
	- [memoryFileSystem](#memoryFileSystem-模块)：文件操作（内存模拟）
	- [fileSystemWatcher](#fileSystemWatcher-模块)：监听
	- [matcher](#matcher-模块)：通配符
	- [path](#path-模块)：路径计算
- 网络
	- [request](#request-模块)：发送 HTTP/HTTPS 请求
	- [httpServer](#httpServer-模块)：HTTP 服务器封装
	- [url](#url-模块)：地址计算
- 进程
	- [process](#process-模块)：进程操作
	- [vm](#vm-模块)：JS 沙盒
- 命令行
	- [ansi](#ansi-模块)：命令行颜色、格式
	- [commandLine](#commandLine-模块)：命令行操作
- 编码、解析
	- [base64](#base64-模块)：Base64 和 DataURI 编码
	- [crypto](#crypto-模块)：MD5 和 SHA-1 加密
	- [html](#html-模块)：HTML 编码和解码
	- [js](#js-模块)：JS 字符串编码和解码
	- [json](#json-模块)：JSON 编码和解码
	- [css](#css-模块)：CSS 字符串编码和解码
	- [esm](#esm-模块)：ES6 模块代码转 CommonJS
- 生成代码
	- [lineColumn](#lineColumn-模块)：行列号和索引换算
	- [sourceMap](#sourceMap-模块)：读写源映射（Source Map）
	- [textWriter](#textWriter-模块)：字符串拼接和生成源映射（Source Map）
	- [textDocument](#textDocument-模块)：字符串编辑和生成源映射（Source Map）
- 异步
	- [asyncQueue](#asyncQueue-模块)：串行执行多个异步任务
	- [deferred](#deferred-模块)：用于同时等待多个异步任务
	- [eventEmitter](#eventEmitter-模块)：支持异步的事件触发器
- 其它
	- [misc](#misc-模块)：其它小工具函数

### `fileSystem` 模块
```js
const { FileSystem } = require("tutils/fileSystem")
const fs = new FileSystem()
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

### `fileSystemSync` 模块
```js
const fs = require("tutils/fileSystemSync")
```

### `memoryFileSystem` 模块
```js
const { MemoryFileSystem } = require("tutils/memoryFileSystem")
const fs = new MemoryFileSystem()
```

### `fileSystemWatcher` 模块
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

### `matcher` 模块
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

### `path` 模块
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

### `request` 模块
```js
const request = require("tutils/request")

const html = await request.request("https://www.baidu.com")
console.log(html)
```

npm 组件名         | TUtils 对应的组件函数
-------------------|----------------------------------------
`request`          | `createHTTPReqest`
`got`              | `createHTTPReqest`
`axios`            | `createHTTPReqest`
`wreck`            | `createHTTPReqest`
`cookiejar`        | `CookieJar`
`touch-cookiejar`  | `CookieJar`

### `httpServer` 模块
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
`cookie-parser`             | `HTTPRequest.cookie`
`cookie-sessions`           | `HTTPServer.sessions`
`multipart`                 | `HTTPRequest.files`

### `url` 模块
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

### `process` 模块
```js
const process = require("tutils/process")
```

npm 组件名                  | TUtils 对应的组件函数
----------------------------|----------------------------------------
`cross-spawn`               | `exec`
`execa`                     | `exec`
`open`                      | `open`
`signal-exit`               | `onExit`, `offExit`

### `vm` 模块
```js
const vm = require("tutils/vm")
vm.runInVM(`var x = 1`)
```

### `ansi` 模块
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

### `commandLine` 模块
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
--                          | `select`

### `base64` 模块
```js
const base64 = require("tutils/base64")
```

npm 组件名                  | TUtils 对应的组件函数
----------------------------|----------------------------------------
`js-base64`                 | `encodeBase64`, `decodeBase64`
`data-urlse`                | `encodeDataURI`, `decodeDataURI`

### `crypto` 模块
```js
const crypto = require("tutils/crypto")
```

npm 组件名                  | TUtils 对应的组件函数
----------------------------|----------------------------------------
`md5`                       | `md5`
`sha1`                      | `sha1`

### `html` 模块
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
--                          | `quoteHTMLAttribute`
--                          | `quoteHTMLAttribute`, `unquoteHTMLAttribute`
`html-parser`               | `parseHTML`

### `js` 模块
```js
const js = require("tutils/js")
```

npm 组件名                  | TUtils 对应的组件函数
----------------------------|----------------------------------------
`js-string-escape`          | `encodeJSString`

### `json` 模块
```js
const json = require("tutils/json")
```

npm 组件名                  | TUtils 对应的组件函数
----------------------------|----------------------------------------
`strip-json-comments`       | `normalizeJSON`
`load-json-file`            | `readJSON`
`write-json-file`           | `writeJSON`

### `css` 模块
```js
const css = require("tutils/css")
```

npm 组件名                  | TUtils 对应的组件函数
----------------------------|----------------------------------------
`cssesc`                    | `encodeCSSString`

### `esm` 模块
```js
const { transformESModuleToCommonJS } = require("tutils/esm")
```

npm 组件名                  | TUtils 对应的组件函数
----------------------------|----------------------------------------
`esm`                       | `transformESModuleToCommonJS`

### `lineColumn` 模块
```js
const lineColumn = require("tutils/lineColumn")
```

npm 组件名                  | TUtils 对应的组件函数
----------------------------|----------------------------------------
`lines-and-columns`         | `LineMap`
`find-line-column`          | `indexToLineColumn`, `lineColumnToIndex`

### `sourceMap` 模块
```js
const sourceMap = require("tutils/sourceMap")

const map = new sourceMap.SourceMapBuilder({ /* 已存在的 map*/ })
map.addMapping(1, 2)
map.toJSON() // 生成的新 map
```

npm 组件名                  | TUtils 对应的组件函数
----------------------------|----------------------------------------
`source-map`                | `SourceMapBuilder`
`convert-source-map`        | `SourceMapBuilder`
`merge-source-map`          | `SourceMapBuilder.applySourceMap`

### `textWriter` 模块
```js
const { TextWriter, SourceMapTextWriter } = require("tutils/textWriter")
```

npm 组件名                  | TUtils 对应的组件函数
----------------------------|----------------------------------------
`string-builder`            | `TextWriter`
`source-list-map`           | `SourceMapTextWriter`
`fast-sourcemap-concat`     | `SourceMapTextWriter`

### `textDocument` 模块
```js
const { TextDocument, replace, insert } = require("tutils/textDocument")

const data = {
	content: "var a = 1",
	path: "source.js"
}
replace(data, /\bvar\b/g, "let")
console.log(data.content)
console.log(data.sourceMapData)
```

npm 组件名                  | TUtils 对应的组件函数
----------------------------|----------------------------------------
`magic-string`              | `TextDocument`

### `asyncQueue` 模块
```js
const { AsyncQueue } = require("tutils/asyncQueue")

const asyncQueue = new AsyncQueue()
await asyncQueue.then(async ()=> { /* 异步操作 1 */ })
await asyncQueue.then(async ()=> { /* 异步操作 2 */ })
await asyncQueue.then(async ()=> { /* 异步操作 3 */ })
```

npm 组件名                  | TUtils 对应的组件函数
----------------------------|----------------------------------------
`asyncqueue`                | `AsyncQueue`
`node-asyncqueue`           | `AsyncQueue`

### `deferred` 模块
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

### `eventEmitter` 模块
```js
const { EventEmitter } = require("tutils/eventEmitter")

const events = new EventEmitter()
events.on("error", data => console.log(data))  // 绑定 error 事件
events.emit("error", "hello")                  // 触发 error 事件，输出 hello
```

npm 组件名                  | TUtils 对应的组件函数
----------------------------|----------------------------------------
`events`                    | `EventEmitter`
`tappable`                  | `EventEmitter`

### `misc` 模块
```js
const misc = require("tutils/misc")
```

npm 组件名                  | TUtils 对应的组件函数
----------------------------|----------------------------------------
`strip-bom`                 | `stripBOM`
`sorted-array-type`         | `insertSorted`
`throttle-debounce`         | `throttle`
`escape-string-regexp`      | `escapeRegExp`
`format-date`               | `formatDate`
`dateformat`                | `formatDate`
`Moment.js`                 | `formatDate`
`node-dateformate`          | `formatDate`
`pretty-hrtime`             | `formatHRTime`
`pretty-time`               | `formatHRTime`
`pretty-bytes`              | `formatSize`
`pretty-size`               | `formatSize`