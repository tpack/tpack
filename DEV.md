## 文件列表
- [x] 脚手架
	- [x] [.gitignore](.gitignore)
	- [x] [.editorconfig](.editorconfig)
	- [x] [LICENSE](LICENSE)
	- [x] TS 配置文件
		- [x] [tsconfig.json](tsconfig.json)
		- [x] [src/tsconfig.json](src/tsconfig.json)
		- [x] [test/tsconfig.json](test/tsconfig.json)
	- [x] VSCode 配置文件
		- [x] [settings.json](.vscode/settings.json)
		- [x] [tasks.json](.vscode/tasks.json)
		- [x] [launch.json](.vscode/launch.json)
	- [x] [package.json](package.json)
- [ ] 工具函数(src/utils)
	- [x] 测试工具
		- [x] [consoleHelper.ts](test/helpers/consoleHelper.ts)
		- [x] [fsHelper.ts](test/helpers/fsHelper.ts)
	- [ ] 文件操作
		- [x] [path.ts](src/utils/path.ts)
			- [x] [path.test.ts](test/utils/path.test.ts)
		- [x] [matcher.ts](src/utils/matcher.ts)
			- [x] [matcher.test.ts](test/utils/matcher.test.ts)
		- [x] [fileSystem.ts](src/utils/fileSystem.ts)
			- [x] [fileSystem.test.ts](test/utils/fileSystem.test.ts)
		- [x] [fileSystemSync.ts](src/utils/fileSystemSync.ts)
			- [x] [fileSystemSync.test.ts](test/utils/fileSystemSync.test.ts)
		- [ ] [memoryFileSystem.ts](src/utils/memoryFileSystem.ts)
			- [ ] [memoryFileSystem.test.ts](test/utils/memoryFileSystem.test.ts)
		- [x] [fileSystemWatcher.ts](src/utils/fileSystemWatcher.ts)
			- [x] [fileSystemWatcher.test.ts](test/utils/fileSystemWatcher.test.ts)
	- [x] 网络
		- [x] [url.ts](src/utils/url.ts)
			- [x] [url.test.ts](test/utils/url.test.ts)
		- [x] [httpServer.ts](src/utils/httpServer.ts)
			- [x] [httpServer.test.ts](test/utils/httpServer.test.ts)
		- [x] [request.ts](src/utils/request.ts)
			- [x] [request.test.ts](test/utils/request.test.ts)
	- [x] 进程
		- [x] [process.ts](src/utils/process.ts)
			- [x] [process.test.ts](test/utils/process.test.ts)
		- [x] [vm.ts](src/utils/vm.ts)
			- [x] [vm.test.ts](test/utils/vm.test.ts)
	- [x] 命令行
		- [x] [ansi.ts](src/utils/ansi.ts)
			- [x] [ansi.test.ts](test/utils/ansi.test.ts)
		- [x] [commandLine.ts](src/utils/commandLine.ts)
			- [x] [commandLine.test.ts](test/utils/commandLine.test.ts)
	- [x] 编码、解析
		- [x] [base64.ts](src/utils/base64.ts)
			- [x] [base64.test.ts](test/utils/base64.test.ts)
		- [x [crypto.ts](src/utils/crypto.ts)
			- [x] [crypto.test.ts](test/utils/crypto.test.ts)
		- [x] [html.ts](src/utils/html.ts)
			- [x] [data/htmlEntities.json](src/utils/data/htmlEntities.json)
			- [x] [html.test.ts](test/utils/html.test.ts)
		- [x] [js.ts](src/utils/js.ts)
			- [x] [js.test.ts](test/utils/js.test.ts)
		- [x] [css.ts](src/utils/css.ts)
			- [x] [css.test.ts](test/utils/css.test.ts)
		- [x] [json.ts](src/utils/json.ts)
			- [x] [json.test.ts](test/utils/json.test.ts)
		- [x] [esm.ts](src/utils/esm.ts)
			- [x] [esm.test.ts](test/utils/esm.test.ts)
	- [x] 生成代码
		- [x] [lineColumn.ts](src/utils/lineColumn.ts)
			- [x] [lineColumn.test.ts](test/utils/lineColumn.test.ts)
		- [x] [sourceMap.ts](src/utils/sourceMap.ts)
			- [x] [sourceMap.test.ts](test/utils/sourceMap.test.ts)
		- [x] [textWriter.ts](src/utils/textWriter.ts)
			- [x] [textWriter.test.ts](test/utils/textWriter.test.ts)
		- [x] [textDocument.ts](src/utils/textDocument.ts)
			- [x] [textDocument.test.ts](test/utils/textDocument.test.ts)
	- [x] 异步
		- [x] [asyncQueue.ts](src/utils/asyncQueue.ts)
			- [x] [asyncQueue.test.ts](test/utils/asyncQueue.test.ts)
		- [x] [deferred.ts](src/utils/deferred.ts)
			- [x] [deferred.test.ts](test/utils/deferred.test.ts)
		- [x] [eventEmitter.ts](src/utils/eventEmitter.ts)
			- [x] [eventEmitter.test.ts](test/utils/eventEmitter.test.ts)
	- [x] 其它
		- [x] [misc.ts](src/utils/misc.ts)
			- [x] [misc.test.ts](test/utils/misc.test.ts)
	- [x] 文档
		- [x] [package.json](src/utils/package.json)
		- [x] [README.md](src/utils/README.md)
- [ ] H2 服务器(src/server)
	- [x] [data/icons/index.json](src/server/data/icons/index.json)
	- [x] [data/mimeTypes.json](src/server/data/mimeTypes.json)
	- [x] [icons.ts](src/server/icons.ts)
	- [x] [mimeTypes.ts](src/server/mimeTypes.ts)
		- [x] [mimeTypes.test.ts](test/server/mimeTypes.test.ts)
	- [x] [webServer.ts](src/server/webServer.ts)
		- [x] [webServer.test.ts](test/server/webServer.test.ts)
	- [ ] [bin/h2server.ts](src/h2server/h2server)
	- [ ] [index.ts](src/h2server/index)
- [ ] 构建核心(src/core)
	- [ ] 工具
		- [ ] [i18n.ts](src/core/i18n.ts)
			- [ ] [i18n.test.ts](test/core/i18n.test.ts)
		- [ ] [logger.ts](src/core/logger.ts)
			- [ ] [logger.test.ts](test/core/logger.test.ts)
		- [ ] [resolver.ts](src/core/resolver.ts)
			- [ ] [resolver.test.ts](test/core/resolver.test.ts)
		- [ ] [require.ts](src/core/require.ts)
	- [ ] 核心
		- [ ] [vfile.ts](src/core/vfile.ts)
			- [ ] [vfile.test.ts](test/core/vfile.test.ts)
		- [ ] [options.ts](src/core/options.ts)
		- [ ] [builder.ts](src/core/builder.ts)
			- [ ] [builtinModules.json](src/configs/builtinModules.json)
			- [ ] [bundlers.json](src/configs/bundlers.json)
			- [ ] [compilers.json](src/configs/compilers.json)
			- [ ] [externalModules.json](src/configs/externalModules.json)
			- [ ] [optimizers.json](src/configs/optimizers.json)
			- [ ] [tags.json](src/configs/tags.json)
			- [ ] [tpack.config.default.js](src/configs/tpack.config.default.js)
	- [ ] 监听和服务
		- [ ] [watcher.ts](src/core/watcher.ts)
		- [ ] [server.ts](src/core/server.ts)
	- [ ] 命令行
		- [ ] [cli.ts](src/core/cli.ts)
			- [ ] [cli.test.ts](test/core/cli.test.ts)
		- [ ] [tpack.ts](src/bin/tpack.ts)
	- [ ] 集成测试
		- [ ] fixtures
			- [ ] [cleancss/basic.css](test/integration/fixtures/cleancss/basic.css)
			- [ ] [cleancss/error.css](test/integration/fixtures/cleancss/error.css)
			- [ ] [cleancss/import.css](test/integration/fixtures/cleancss/import.css)
			- [ ] [coffeescript/basic.coffee](test/integration/fixtures/coffeescript/basic.coffee)
			- [ ] [coffeescript/error.coffee](test/integration/fixtures/coffeescript/error.coffee)
			- [ ] [html-bundler/assets/main.css](test/integration/fixtures/html-bundler/assets/main.css)
			- [ ] [html-bundler/assets/main.js](test/integration/fixtures/html-bundler/assets/main.js)
			- [ ] [html-bundler/error-include.html](test/integration/fixtures/html-bundler/error-include.html)
			- [ ] [html-bundler/include.html](test/integration/fixtures/html-bundler/include.html)
			- [ ] [html-bundler/include/common.html](test/integration/fixtures/html-bundler/include/common.html)
			- [ ] [html-bundler/inline.html](test/integration/fixtures/html-bundler/inline.html)
			- [ ] [html-minifier/basic.html](test/integration/fixtures/html-minifier/basic.html)
			- [ ] [html-minifier/error.html](test/integration/fixtures/html-minifier/error.html)
			- [ ] [jjencode/basic.js](test/integration/fixtures/jjencode/basic.js)
			- [ ] [js-bundler/basic.js](test/integration/fixtures/js-bundler/basic.js)
			- [ ] [js-bundler/import/cjs-export.js](test/integration/fixtures/js-bundler/import/cjs-export.js)
			- [ ] [less/basic.less](test/integration/fixtures/less/basic.less)
			- [ ] [less/error.less](test/integration/fixtures/less/error.less)
			- [ ] [less/import.less](test/integration/fixtures/less/import.less)
			- [ ] [less/import/common/common.less](test/integration/fixtures/less/import/common/common.less)
			- [ ] [less/import/import-css.css](test/integration/fixtures/less/import/import-css.css)
			- [ ] [less/import/import-less.less](test/integration/fixtures/less/import/import-less.less)
			- [ ] [less/import/import-variable.less](test/integration/fixtures/less/import/import-variable.less)
			- [ ] [markdown/basic.md](test/integration/fixtures/markdown/basic.md)
			- [ ] [markdown/highlight.md](test/integration/fixtures/markdown/highlight.md)
			- [ ] [markdown/table.md](test/integration/fixtures/markdown/table.md)
			- [ ] [sass/basic.scss](test/integration/fixtures/sass/basic.scss)
			- [ ] [sass/error.scss](test/integration/fixtures/sass/error.scss)
			- [ ] [sass/import.scss](test/integration/fixtures/sass/import.scss)
			- [ ] [sass/import/common/common.scss](test/integration/fixtures/sass/import/common/common.scss)
			- [ ] [sass/import/import-css.css](test/integration/fixtures/sass/import/import-css.css)
			- [ ] [sass/import/import-variable.scss](test/integration/fixtures/sass/import/import-variable.scss)
			- [ ] [stylus/basic.styl](test/integration/fixtures/stylus/basic.styl)
			- [ ] [stylus/error.styl](test/integration/fixtures/stylus/error.styl)
			- [ ] [stylus/import.styl](test/integration/fixtures/stylus/import.styl)
			- [ ] [stylus/import/common/common.styl](test/integration/fixtures/stylus/import/common/common.styl)
			- [ ] [stylus/import/import-css.css](test/integration/fixtures/stylus/import/import-css.css)
			- [ ] [stylus/import/import-variable.styl](test/integration/fixtures/stylus/import/import-variable.styl)
			- [ ] [uglify-js/basic.js](test/integration/fixtures/uglify-js/basic.js)
			- [ ] [uglify-js/error.js](test/integration/fixtures/uglify-js/error.js)
		- [ ] [package-lock.json](test/integration/package-lock.json)
		- [ ] [package.json](test/integration/package.json)
		- [ ] [tpack.config.js](test/integration/tpack.config.js)
- [ ] 常用插件
	- [ ] compilers
		- [ ] [coffeescript.ts](src/compilers/coffeescript.ts)
		- [ ] [common.ts](src/compilers/common.ts)
		- [ ] [less.ts](src/compilers/less.ts)
		- [ ] [markdown.ts](src/compilers/markdown.ts)
		- [ ] [sass.ts](src/compilers/sass.ts)
		- [ ] [stylus.ts](src/compilers/stylus.ts)
		- [ ] [typescript.ts](src/compilers/typescript.ts)
	- [ ] optimizers
		- [ ] [css.ts](src/optimizers/css.ts)
		- [ ] [html.ts](src/optimizers/html.ts)
		- [ ] [jjencode.ts](src/optimizers/jjencode.ts)
		- [ ] [js.ts](src/optimizers/js.ts)
	- [ ] plugins
		- [ ] [saveErrorAndWarning.ts](src/plugins/saveErrorAndWarning.ts)
- [ ] 打包插件
	- [ ] bundlers
		- [ ] [common.ts](src/bundlers/common.ts)
		- [ ] [css.ts](src/bundlers/css.ts)
		- [ ] [html.ts](src/bundlers/html.ts)
		- [ ] [js.ts](src/bundlers/js.ts)
- [ ] 发布
	- [ ] [tpack.config.ts](tpack.config.ts)
- [ ] 文档
	- [ ] README.md

## BUG

## TODO
optionalPeerDependencies

翻译的时候支持 xxx'ddd'rrrr

cli  formatCommandOptions   ->  commandLine


writeStatic  支持压缩
const request = http.get({ host: 'example.com',
                           path: '/',
                           port: 80,
                           headers: { 'Accept-Encoding': 'br,gzip,deflate' } });
request.on('response', (response) => {
  const output = fs.createWriteStream('example.com_index.html');

  switch (response.headers['content-encoding']) {
    case 'br':
      response.pipe(zlib.createBrotliDecompress()).pipe(output);
      break;
    // Or, just use zlib.createUnzip() to handle both of the following cases:
    case 'gzip':
      response.pipe(zlib.createGunzip()).pipe(output);
      break;
    case 'deflate':
      response.pipe(zlib.createInflate()).pipe(output);
      break;
    default:
      response.pipe(output);
      break;
  }