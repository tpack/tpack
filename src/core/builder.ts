import { readFileSync } from "fs"
import { sep } from "path"
import { getExtByMimeType, getMimeType } from "../server/mimeTypes"
import { formatCodeFrame } from "../utils/ansi"
import { encodeDataURI } from "../utils/base64"
import { Deferred } from "../utils/deferred"
import { EventEmitter } from "../utils/eventEmitter"
import { FileSystem } from "../utils/fileSystem"
import { Logger, LogLevel } from "../utils/logger"
import { Matcher, Pattern } from "../utils/matcher"
import { escapeRegExp, formatDate, formatHRTime, insertSorted, randomString } from "../utils/misc"
import { appendName, containsPath, deepestPath, getDir, pathEquals, relativePath, resolvePath, setDir } from "../utils/path"
import { createSourceMappingURLComment, SourceMapObject } from "../utils/sourceMap"
import { Bundler } from "./bundler"
import { CacheManager } from "./cache"
import { i18n } from "./i18n"
import { GeneratedModule, Module, ModuleDependencyType, ModuleLogEntry, ModuleState } from "./module"
import { BuilderOptions, checkBuilderOptions, ExternalModuleRule } from "./options"
import { PackageManager } from "./package"
import { ProcessorRunner } from "./processor"
import { Server } from "./server"
import { Watcher } from "./watcher"

/** 表示一个构建器 */
export class Builder extends EventEmitter {

	// #region 选项

	/** 获取构建器的原始选项 */
	readonly options: BuilderOptions

	/** 获取构建器的基文件夹绝对路径（即工作目录）*/
	readonly baseDir: string

	/** 获取需要构建的源文件夹绝对路径 */
	readonly rootDir: string

	/** 获取生成的目标文件夹绝对路径 */
	readonly outDir: string

	/** 获取源文件夹中匹配需要构建的文件的匹配器 */
	readonly matcher: Matcher

	/** 获取使用的日志记录器 */
	readonly logger: Logger

	/** 获取使用的文件系统 */
	readonly fs: FileSystem

	/**
	 * 初始化新的构建器
	 * @param options 构建器的附加选项
	 */
	constructor(options: BuilderOptions = {}) {
		super()
		this.checkOptions(options)
		this.options = options

		this.baseDir = resolvePath(options.baseDir || ".")
		this.rootDir = resolvePath(this.baseDir, options.rootDir != undefined ? options.rootDir : "src")
		this.outDir = resolvePath(this.baseDir, options.outDir != undefined ? options.outDir : "dist")

		this.matcher = this.createMatcher(options.match || "**/*", options.exclude != undefined ? options.exclude : ["**/node_modules/**"])
		// 如果源目录包含生成目录，自动排除生成目录
		if (containsPath(this.rootDir, this.outDir)) {
			this.matcher.exclude(this.outDir)
		}
		this.filter = options.filter != undefined ? this.createMatcher(options.filter) : undefined

		this.encoding = options.encoding || "utf-8"
		this.noPathCheck = !!options.noPathCheck
		this.noWrite = options.noWrite !== undefined ? options.noWrite : !!options.devServer && !options.watch

		this.fs = options.fs || new FileSystem()

		this.clean = options.clean !== false && !this.noWrite && !this.filter && !containsPath(this.outDir, this.rootDir)
		this.sourceMap = options.sourceMap !== undefined ? !!options.sourceMap : !options.optimize
		const sourceMapOptions = options.sourceMap
		this.sourceMapOptions = sourceMapOptions == undefined || typeof sourceMapOptions === "boolean" ? { includeFile: true, includeNames: true } : {
			outPath: typeof sourceMapOptions.outPath === "string" ? (module, builder) => builder.formatPath(sourceMapOptions.outPath as string, module) : sourceMapOptions.outPath,
			sourceRoot: sourceMapOptions.sourceRoot,
			source: sourceMapOptions.source,
			sourceContent: sourceMapOptions.sourceContent,
			includeSourcesContent: sourceMapOptions.includeSourcesContent,
			includeFile: sourceMapOptions.includeFile !== false,
			includeNames: sourceMapOptions.includeNames !== false,
			indent: sourceMapOptions.indent,
			url: sourceMapOptions.url === false ? () => false : sourceMapOptions.url === true ? undefined : sourceMapOptions.url,
			inline: sourceMapOptions.inline,
		}
		this.bail = !!options.bail
		this.logger = options.logger instanceof Logger ? options.logger : new Logger(options.logger)
		this.mimeTypes = Object.assign(Object.setPrototypeOf(JSON.parse(readFileSync(`${__dirname}/../server/data/mimeTypes.json`, "utf-8")), null), options.mimeTypes)
		this.reporter = options.reporter === undefined || typeof options.reporter === "string" ? require(`../reporters/${options.reporter || "summary"}`).default : options.reporter

		this.packageManager = new PackageManager(options.installDependency, options.installDevDependency, this.logger)
		this.cacheManager = options.cache === false ? undefined : new CacheManager(this, options.cache === true ? undefined : options.cache)

		const bundlerOptions = options.bundler || {}
		this.externalModules = (bundlerOptions.externalModules || JSON.parse(readFileSync(`${__dirname}/../configs/externalModules.json`, "utf-8")) as ExternalModuleRule[]).map(externalModule => ({
			matcher: externalModule.match != undefined || externalModule.exclude != undefined ? this.createMatcher(externalModule.match || (() => true), externalModule.exclude) : undefined,
			matchType: externalModule.matchType != undefined ? new RegExp(`^${escapeRegExp(externalModule.matchType).replace(/\*/g, ".*")}$`) : undefined,
			minSize: externalModule.minSize || 0,
			outPath: typeof externalModule.outPath === "string" ? (module: Module, builder: Builder) => {
				const originalOutPath = builder.formatPath(externalModule.outPath as string, module)
				if (!builder.emittedModules.has(originalOutPath)) {
					return originalOutPath
				}
				for (let i = 2; ; i++) {
					const newPath = appendName(originalOutPath, `-${i}`)
					if (!builder.emittedModules.has(newPath)) {
						return newPath
					}
				}
			} : externalModule.outPath
		}))

		if (options.watch || options.devServer) {
			this.watcher = new Watcher(this, typeof options.watch === "object" ? options.watch : undefined)
		}
		if (options.devServer) {
			this.server = new Server(this, options.devServer === true ? undefined : typeof options.devServer === "object" ? options.devServer : { url: options.devServer })
		}

		for (const key in bundlerOptions.bundlers) {
			const bundler = bundlerOptions.bundlers[key]
			this.bundlers[key] = typeof bundler === "function" ? new bundler(bundlerOptions, this) : bundler
		}
		if (bundlerOptions.target === undefined || bundlerOptions.target === "browser") {
			const browserBundlers = JSON.parse(readFileSync(`${__dirname}/../configs/bundlers.json`, "utf-8"))
			for (const key in browserBundlers) {
				if (!this.bundlers[key]) {
					this.bundlers[key] = this.bundlers[browserBundlers[key]] || new (require(resolvePath(__dirname, browserBundlers[key])).default)(bundlerOptions, this)
				}
			}
		}

		const workerPool = ProcessorRunner.createWorkerPool(this, options.parallel)
		this.compiler = new ProcessorRunner(this, options.compilers || JSON.parse(readFileSync(`${__dirname}/../configs/compilers.json`, "utf-8")), "compilers", workerPool)
		this.optimizer = options.optimize ? new ProcessorRunner(this, options.optimizers || JSON.parse(readFileSync(`${__dirname}/../configs/optimizers.json`, "utf-8")), "optimizers", workerPool) : undefined

		if (options.plugins) {
			for (const plugin of options.plugins) {
				plugin.apply(this)
			}
		}
	}

	/**
	 * 检查配置的合法性
	 * @param options 要检查的配置
	 */
	protected checkOptions(options: BuilderOptions) {
		if (options == undefined) {
			return
		}
		const errors: string[] = []
		checkBuilderOptions(options, "options", errors)
		if (errors.length) {
			const error = new TypeError(errors.join("\n")) as Error & { code: string }
			error.code = "ConfigError"
			throw error
		}
	}

	/**
	 * 创建一个路径匹配器
	 * @param match 匹配的模式
	 * @param exclude 排除的模式
	 */
	createMatcher(match: Pattern, exclude?: Pattern) {
		const matcher = new Matcher(match, this.baseDir, false)
		if (exclude) {
			matcher.exclude(exclude)
		}
		return matcher
	}

	/**
	 * 替换输出路径中的变量
	 * @param outPath 用户设置的输出路径
	 * @param module 相关的模块
	 * @param baseDir 基路径
	 */
	formatPath(outPath: string, module: Module, baseDir = this.rootDir) {
		return outPath.replace(/<(\w+)(?::(\d+))?>/g, (source, key, argument) => {
			switch (key) {
				case "path":
					return relativePath(baseDir, module.path)
				case "dir":
					return relativePath(baseDir, module.dir)
				case "name":
					return module.name
				case "ext":
					return module.ext
				case "hash":
					return module.hash.slice(0, +argument || 8)
				case "md5":
					return module.md5.slice(0, +argument || 8)
				case "sha1":
					return module.sha1.slice(0, +argument || 8)
				case "random":
					return randomString(+argument || 8)
				case "date":
					return argument ? new Date().toLocaleString() : formatDate(new Date(), argument)
				case "version":
					return this.version
				default:
					return source
			}
		})
	}

	/** 获取构建器的版本号 */
	get version() { return JSON.parse(readFileSync(`${__dirname}/../../package.json`, "utf-8")).version as string }

	/**
	 * 获取指定路径基于根目录的绝对路径
	 * @param path 要计算的相对路径
	 * @returns 返回以 `/`(非 Windows) 或 `\`(Windows) 为分隔符的绝对路径，路径末尾多余的分隔符会被删除
	 */
	resolvePath(path: string) {
		return resolvePath(this.rootDir, path)
	}

	/**
	 * 获取指定路径基于根目录的相对路径
	 * @param path 要处理的路径
	 * @returns 返回以 `/` 为分隔符的相对路径，路径末尾多余的分隔符会被删除
	 */
	relativePath(path: string) {
		return relativePath(this.rootDir, path)
	}

	// #endregion

	// #region 构建流程

	/** 如果需要监听模块并自动重新构建，则为使用的监听器，否则为 `undefined` */
	readonly watcher?: Watcher

	/** 如果需要启动本地 HTTP 服务器以浏览编译后的模块，则为使用的服务器，否则为 `undefined` */
	readonly server?: Server

	/**
	 * 构建完成后的报告器
	 * @param context 构建的上下文
	 * @param builder 当前的构建器对象
	 */
	readonly reporter?: (context: BuildContext, builder: Builder) => void

	/** 表示缓存管理器，如果禁用缓存则为 `undefined` */
	readonly cacheManager?: CacheManager

	/**
	 * 根据当前配置启动构建器
	 * @returns 返回打包的错误数
	 */
	async run() {
		// 启动监听器
		if (this.watcher) {
			await this.watcher.start()
			if (this.server) {
				await this.server.start()
			}
			return 0
		}
		// 执行完整流程
		const buildContext = await this.build()
		if (this.reporter) {
			this.reporter(buildContext, this)
		}
		return buildContext.errorCount
	}

	/** 判断是否仅构建但不保存文件到目标文件夹 */
	readonly noWrite: boolean

	/** 判断是否在构建前清理生成文件夹 */
	readonly clean: boolean

	/** 匹配本次要构建模块的匹配器 */
	readonly filter?: Matcher

	/** 当前构建的上下文 */
	context?: BuildContext

	/** 判断是否正在构建 */
	get isBuilding() { return !!this.context }

	/** 确保所有模块都已完成后继续 */
	private readonly deferred = new Deferred()

	/**
	 * 构建整个项目
	 * @param modules 如果仅构建指定的模块则为待构建的所有模块
	 * @param fullBuild 是否执行全量构建
	 * @returns 返回包含本次构建信息的对象
	 */
	async build(modules?: Iterable<Module>, fullBuild = modules === undefined) {
		// 构建流程:
		// 1. 扫描所有入口模块
		// 2. 加载所有模块及依赖
		// 3. 计算所有模块的打包结果
		// 4. 生成所有入口模块的打包结果
		const buildingTask = this.logger.begin(fullBuild ? i18n`Building` : i18n`Building incrementally`)
		const context = this.context = new BuildContext(fullBuild)
		try {
			// 准备开始
			this.logger.progressPercent(context.progress)
			await this.emit("buildStart", context)
			// 扫描所有入口模块
			const entryModules = context.entryModules
			const filter = this.filter
			if (modules === undefined) {
				// 清理目标文件夹
				if (this.clean) {
					const cleaningTask = this.logger.begin(i18n`Cleaning`, this.logger.formatPath(this.outDir))
					try {
						await this.fs.cleanDir(this.outDir)
					} finally {
						this.logger.end(cleaningTask)
					}
				}
				// 加载缓存
				if (this.cacheManager) {
					const loadingCacheTask = this.logger.begin(i18n`Loading Cache`)
					try {
						await this.cacheManager.loadCache()
					} finally {
						this.logger.end(loadingCacheTask)
					}
				}
				// 遍历根文件夹
				const scanningTask = this.logger.begin(i18n`Scanning`, this.logger.formatPath(this.rootDir))
				try {
					let filtered = false
					const matcher = this.matcher
					// 选择层次最深的文件夹开始遍历，减少遍历次数
					let walkPath = deepestPath(this.rootDir, matcher.base, this.fs.isCaseInsensitive)
					if (filter && walkPath) {
						walkPath = deepestPath(walkPath, filter.base, this.fs.isCaseInsensitive)
						if (!walkPath) {
							filtered = true
						}
					}
					if (walkPath) {
						await this.fs.walk(walkPath, {
							dir: matcher.excludeMatcher ? path => !matcher.excludeMatcher!.test(path) : undefined,
							file: path => {
								if (matcher.test(path)) {
									if (filter && !filter.test(path)) {
										filtered = true
										return
									}
									const module = this.getModule(path)
									// 为了确保每次打包处理结果完全一致，对 entryModules 的模块按路径排序
									insertSorted(entryModules, module, compareModule)
								}
							}
						})
					}
					// 警告用户，因为加了自定义筛选器，所以本次没有构建任何模块
					if (!entryModules.length && filtered) {
						this.logger.warning(i18n`No entry modules match the current filter`)
						context.warningCount++
					}
				} finally {
					this.logger.end(scanningTask)
				}
			} else {
				for (const module of modules) {
					if (module.state === ModuleState.deleted) {
						continue
					}
					if (filter && !filter.test(module.originalPath)) {
						continue
					}
					insertSorted(entryModules, module, compareModule)
				}
			}

			/** 确定模块的顺序 */
			function compareModule(x: Module, y: Module) {
				const lengthOffset = x.originalPath.length - x.originalPath.length
				return lengthOffset ? lengthOffset > 0 : x.originalPath <= y.originalPath
			}

			// 任务数 = 收集任务 + 所有模块的编译任务 + 打包任务 + 所有模块的生成任务
			context.totalTaskCount = entryModules.length * 2 + 2
			context.doneTaskCount = 1
			this.logger.progressPercent(context.progress)
			// 加载（编译、解析）入口模块及其依赖
			const loadingTask = this.logger.begin(i18n`Loading modules`)
			try {
				await this.emit("loadStart", context)
				// 理论上，加载一个模块，需要等待其依赖和依赖的依赖都加载完成
				// 但如果存在循环依赖（一般项目都会存在），就会导致互相等待，程序死锁
				// 为解决这个问题并简化复杂度，改用全局计数器的策略，模块不互相等待，当所有模块都加载完成再继续后续流程
				let firstError: any
				for (const module of entryModules) {
					this.loadModule(module).then(() => {
						context.doneTaskCount++
						this.logger.progressPercent(context.progress)
					}, e => {
						if (firstError === undefined) {
							firstError = e
						}
					})
					// 为避免进程阻塞程序，每处理完一个模块中断一次
					if (!this.compiler.workerPool) {
						await new Promise(resolve => setImmediate(resolve))
					}
				}
				await this.deferred
				if (firstError !== undefined) {
					throw firstError
				}
				await this.emit("loadEnd", context)
			} finally {
				this.logger.end(loadingTask)
			}
			// 打包模块
			const bundlingTask = this.logger.begin(i18n`Bundling modules`)
			try {
				for (const key in this.bundlers) {
					const bundler = this.bundlers[key]
					if (bundler && bundler.bundle) {
						await bundler.bundle(entryModules, this)
					}
				}
				context.doneTaskCount++
				this.logger.progressPercent(context.progress)
			} finally {
				this.logger.end(bundlingTask)
			}
			// 生成（合成、优化、保存）入口模块
			const emittingTask = this.logger.begin(i18n`Emitting modules`)
			try {
				await this.emit("emitStart", context)
				let firstError: any
				for (const module of entryModules) {
					if (module.noWrite) {
						context.doneTaskCount++
						this.logger.progressPercent(context.progress)
						continue
					}
					(module.promise || (module.promise = this.emitModule(module))).then(() => {
						context.doneTaskCount++
						this.logger.progressPercent(context.progress)
					}, e => {
						if (firstError === undefined) {
							firstError = e
						}
					})
				}
				await this.deferred
				if (firstError !== undefined) {
					throw firstError
				}
				await this.emit("emitEnd", context)
			} finally {
				this.logger.end(emittingTask)
			}
			// 等待缓存
			if (fullBuild && this.cacheManager) {
				const savingCacheTask = this.logger.begin(i18n`Saving Cache`)
				try {
					await this.cacheManager.saveCache()
				} finally {
					this.logger.end(savingCacheTask)
				}
			}
			// 完成构建
			await this.emit("buildEnd", context)
		} finally {
			this.context = undefined
			this.logger.end(buildingTask)
		}
		return context
	}

	/** 获取所有模块，键为模块的原始绝对路径，值为模块对象 */
	readonly modules = new Map<string, Module>()

	/**
	 * 获取指定路径对应的模块
	 * @param path 模块的原始绝对路径
	 */
	getModule(path: string) {
		let module = this.modules.get(path)
		if (module === undefined) {
			module = new Module(path, this.isEntryModule(path))
			module.sourceMap = this.sourceMap
			this.modules.set(path, module)
		}
		return module
	}

	/**
	 * 判断指定的路径是否是入口模块路径
	 * @param path 要判断的绝对路径
	 */
	isEntryModule(path: string) {
		return containsPath(this.rootDir, path, this.fs.isCaseInsensitive) && this.matcher.test(path)
	}

	// #endregion

	// #region 加载模块

	/** 获取使用的编译器 */
	readonly compiler: ProcessorRunner

	/** 所有模块打包器 */
	readonly bundlers: { [ext: string]: Bundler | false } = Object.create(null)

	/**
	 * 加载指定的模块
	 * @param module 要加载的模块
	 */
	protected async loadModule(module: Module) {
		if (module.state !== ModuleState.initial) {
			return
		}
		module.state = ModuleState.loading
		this.deferred.reject()
		try {
			// 编译模块
			await this.compiler.process(module)
			// 绑定打包器
			let bundler = module.bundler
			if (bundler === undefined) {
				module.bundler = bundler = this.bundlers[module.ext.toLowerCase()]
			}
			// 解析模块
			if (bundler) {
				if (module.data === undefined && bundler.read !== false) {
					if (!await this.readModule(module, bundler.read === "text", bundler.constructor.name)) {
						module.data = ""
					}
				}
				const parsingTask = this.logger.begin(i18n`Parsing`, this.logger.formatPath(module.originalPath))
				module.processorName = bundler.constructor.name
				try {
					await bundler.parse(module, this)
				} catch (e) {
					module.addError(e)
				} finally {
					module.processorName = undefined
					this.logger.end(parsingTask)
				}
			}
			// 加载依赖
			if (module.dependencies) {
				for (const dependency of module.dependencies) {
					if (dependency.module) {
						this.loadModule(dependency.module)
						continue
					}
					if (dependency.type === ModuleDependencyType.external || dependency.type === ModuleDependencyType.externalList) {
						continue
					}
					if (!dependency.path) {
						if (!bundler || dependency.url == undefined) {
							continue
						}
						const path = await bundler.resolve(dependency, module, this)
						if (path) {
							dependency.path = path
						} else {
							if (path === null) {
								const log = {
									source: bundler.constructor.name,
									message: dependency.type === ModuleDependencyType.staticImport || dependency.type === ModuleDependencyType.dynamicImport ? i18n`Cannot find module '${dependency.url}'` : i18n`Cannot find file '${this.logger.formatPath(module.resolvePath(dependency.url))}'`,
									index: dependency.index,
									endIndex: dependency.endIndex,
									detail: dependency.detail,
								} as ModuleLogEntry
								if (dependency.type === ModuleDependencyType.reference) {
									module.addWarning(log)
								} else {
									module.addError(log)
								}
								await this.emit("dependencyNotFound", dependency, module)
							}
							continue
						}
					}
					this.loadModule(dependency.module = this.getModule(dependency.path))
				}
			}
			// 加载完成
			if (module.type === undefined) module.type = this.getMimeType(module.path)
			module.state = ModuleState.loaded
			// 添加监听
			if (this.watcher) {
				this.watcher.addModule(module)
			}
			await this.emit("loadModule", module)
			await this.reportLogs(module)
		} finally {
			this.deferred.resolve()
		}
	}

	/** 获取读取文本模块内容时，默认使用的模块编码 */
	readonly encoding: string

	/**
	 * 读取模块的内容
	 * @param module 要读取的模块
	 * @param text 是否以文本方式读取
	 * @param source 读取的来源
	 * @returns 如果读取成功则返回 `true`，否则返回 `false`
	 */
	async readModule(module: Module, text?: boolean, source?: string) {
		const readingTask = this.logger.begin(i18n`Reading`, this.logger.formatPath(module.originalPath))
		try {
			if (text) {
				module.data = await this.fs.readFile(module.originalPath, this.encoding)
			} else {
				module.data = await this.fs.readFile(module.originalPath)
			}
		} catch (e) {
			module.addError({
				source: source,
				message: i18n`Cannot read file: ${e.message}`,
				error: e
			})
			return false
		} finally {
			this.logger.end(readingTask)
		}
		return true
	}

	/** 获取所有自定义扩展名（含点）到 MIME 类型的映射表 */
	readonly mimeTypes: { [ext: string]: string }

	/**
	 * 获取指定模块名对应的 MIME 类型
	 * @param path 要获取的模块名
	 * @param mimeTypes 所有扩展名（含点）到 MIME 类型的映射表
	 */
	getMimeType(path: string) {
		return getMimeType(path, this.mimeTypes) || "application/octet-stream"
	}

	/**
	 * 获取指定 MIME 类型对应的扩展名
	 * @param mimeType 要获取的类型
	 */
	getExtByMimeType(mimeType: string) {
		return getExtByMimeType(mimeType, this.mimeTypes)
	}

	// #endregion

	// #region 生成模块

	/** 获取使用的优化器 */
	readonly optimizer?: ProcessorRunner

	/** 获取提取外部模块的规则 */
	readonly externalModules: {
		/** 模块路径匹配器 */
		matcher?: Matcher
		/** 匹配 MIME 类型的正则表达式 */
		matchType?: RegExp
		/** 最小模块字节大小 */
		minSize: number
		/**
		 * 获取提取的最终路径的回调函数
		 * @param module 要提取的模块
		 * @param builder 当前的构建器对象
		 */
		outPath: (module: Module, builder: Builder) => string
	}[]

	/** 判断是否需要生成源映射（Source Map）*/
	readonly sourceMap: boolean

	/** 获取生成源映射（Source Map）的选项 */
	readonly sourceMapOptions: {
		/**
		 * 获取源映射保存路径的回调函数
		 * @param module 所属的模块
		 * @param builder 当前构建器的对象
		*/
		readonly outPath?: (module: Module, builder: Builder) => string
		/** 源映射中所有源文件的根地址 */
		readonly sourceRoot?: string
		/**
		 * 获取每个源文件地址的回调函数
		 * @param sourcePath 源文件绝对路径
		 * @param sourceMapPath 源映射绝对路径
		 * @param module 所属的模块
		 * @param builder 当前构建器的对象
		 */
		readonly source?: (sourcePath: string, sourceMapPath: string, module: Module, builder: Builder) => string
		/**
		 * 获取每个源文件内容的回调函数
		 * @param sourcePath 源文件绝对路径
		 * @param sourceMapPath 源映射绝对路径
		 * @param module 所属的模块
		 * @param builder 当前构建器的对象
		 */
		readonly sourceContent?: (sourcePath: string, sourceMapPath: string, module: Module, builder: Builder) => string | Promise<string>
		/** 是否在源映射中内联源内容 */
		readonly includeSourcesContent?: boolean
		/** 是否在源映射中包含目标文件字段 */
		readonly includeFile?: boolean
		/** 是否在源映射中包含符号名称字段 */
		readonly includeNames?: boolean
		/** 生成源映射的缩进字符串或缩进空格数，如果为空或 0 则不缩进 */
		readonly indent?: string | number
		/**
		 * 获取在生成的模块中插入的指向源映射的地址的回调函数
		 * @param sourceMapPath 源映射的最终保存绝对路径
		 * @param module 所属的模块
		 * @param builder 当前构建器的对象
		 * @returns 返回地址，如果为 `false` 则不插入源映射注释
		 */
		readonly url?: (sourceMapPath: string, module: Module, builder: Builder) => string | false | null
		/** 是否将源映射内联到生成的模块中 */
		readonly inline?: boolean
	}

	/**
	 * 生成指定的模块
	 * @param module 要生成的模块
	 */
	protected async emitModule(module: Module) {
		if (module.state !== ModuleState.loaded) {
			return
		}
		module.state = ModuleState.emitting
		this.deferred.reject()
		try {
			// 生成依赖
			// 在生成当前模块前要先等待其内联的模块和动态导入的模块的最终生成结果，
			// 但如果模块之间有循环依赖，会导致互相等待，这时必须放弃等待某个依赖，
			// 同时为了确保每次生成的结果完全一致，每次打包必须放弃等待同一个依赖，
			// 为了满足这个需求，分两次遍历依赖，第一次同步检测循环依赖，以确保每次返回相同的结果，第二次真正等待依赖加载
			if (module.dependencies) {
				for (const dependency of module.dependencies) {
					// 忽略解析错误的模块
					const dependencyModule = dependency.module
					if (!dependencyModule) {
						continue
					}
					if (!dependency.inline && dependency.type === ModuleDependencyType.staticImport && dependencyModule.type !== module.type) {
						dependency.inline = true
					}
					if (!dependency.inline && (dependency.type === ModuleDependencyType.staticImport || dependency.type === ModuleDependencyType.external || dependency.type === ModuleDependencyType.externalList)) {
						continue
					}
					switch (dependencyModule.state) {
						case ModuleState.loaded:
							dependencyModule.promise = this.emitModule(dependencyModule)
							break
						case ModuleState.emitting:
							// 所有模块生成的步骤为：标记为“正在生成” - 生成依赖 - 开始生成（保存确认对象）- 等待生成完成（删除确认对象）
							// 因此，如果发现某个依赖已标记“正在生成”，但未开始生成，说明该模块和当前模块都正在生成依赖，即和当前模块存在循环依赖
							if (!dependencyModule.promise) {
								dependency.circular = true
							}
							break
					}
				}
				for (const dependency of module.dependencies) {
					if (!dependency.inline && (dependency.type === ModuleDependencyType.staticImport || dependency.type === ModuleDependencyType.external || dependency.type === ModuleDependencyType.externalList)) {
						continue
					}
					const dependencyModule = dependency.module!
					if (dependencyModule.promise && !dependency.circular) {
						await dependencyModule.promise
						const generatedModule = dependencyModule.generatedModules![0]
						// 自动内联不生成最终模块的依赖
						if (generatedModule.noWrite) {
							dependency.inline = true
						}
						// 如果需要内联模块，强制读取模块内容
						if (dependency.inline && generatedModule.bufferOrContent === undefined) {
							await this.readModule(generatedModule as Module, false, i18n`Inline`)
						}
					}
				}
			}
			// 创建模块
			const generatedModule = Object.create(module) as Module
			generatedModule.originalModule = module
			generatedModule.generatedModules = generatedModule.props = generatedModule.dependencies = generatedModule.logs = undefined
			module.generatedModules = module.generatedModules || []
			module.generatedModules.unshift(generatedModule)
			// 合成模块
			const bundler = module.bundler
			if (bundler && bundler.generate) {
				const generatingTask = this.logger.begin(i18n`Generating`, this.logger.formatPath(module.originalPath))
				module.processorName = bundler.constructor.name
				try {
					await bundler.generate(module, generatedModule, this)
				} catch (e) {
					generatedModule.addError(e)
				} finally {
					module.processorName = undefined
					this.logger.end(generatingTask)
				}
			}
			// 优化模块
			if (this.optimizer && !generatedModule.hasErrors) {
				await this.optimizer.process(generatedModule)
			}
			// 外部模块是不需要生成的，如果外部模块参与生成，一定是因为被入口模块非静态依赖
			if (!generatedModule.isEntryModule) {
				generatedModule.noWrite = true
				for (const externalModule of this.externalModules) {
					if (externalModule.matcher && !externalModule.matcher.test(generatedModule.path, generatedModule, this)) {
						continue
					}
					if (externalModule.matchType && !externalModule.matchType.test(generatedModule.type!)) {
						continue
					}
					if (externalModule.minSize) {
						if (generatedModule.data === undefined) {
							const stat = await this.fs.getStat(generatedModule.originalPath)
							if (stat.size < externalModule.minSize) {
								continue
							}
						} else {
							// 因为 generatedModule.size >= generatedModule.bufferOrContent.length，且前者性能较差，
							// 所以优先通过后者判断是否符合条件，不符合再用前者精确判定
							if (generatedModule.bufferOrContent.length < externalModule.minSize && generatedModule.size < externalModule.minSize) {
								continue
							}
						}
					}
					generatedModule.path = this.resolvePath(externalModule.outPath(generatedModule, this))
					generatedModule.noWrite = false
					break
				}
			}
			// 生成源映射
			if (generatedModule.sourceMap) {
				const originalMap = generatedModule.sourceMapObject
				if (originalMap) {
					const mapPath = this.sourceMapOptions.inline ? generatedModule.path : this.sourceMapOptions.outPath ? this.resolvePath(this.sourceMapOptions.outPath(module, this)) : generatedModule.path + ".map"
					const mapDir = getDir(mapPath)
					const mapOutDir = this.getOutputPath(mapDir)
					const mapObject = {
						version: originalMap.version || 3
					} as SourceMapObject
					if (this.sourceMapOptions.includeFile) {
						mapObject.file = relativePath(mapDir, generatedModule.path)
					}
					if (this.sourceMapOptions.sourceRoot !== undefined) {
						mapObject.sourceRoot = this.sourceMapOptions.sourceRoot
					}
					if (originalMap.sources) {
						mapObject.sources = []
						for (let i = 0; i < originalMap.sources.length; i++) {
							mapObject.sources[i] = this.sourceMapOptions.source ?
								this.sourceMapOptions.source(originalMap.sources[i], mapPath, module, this) :
								mapObject.sourceRoot ?
									mapObject.sourceRoot === "file:///" ?
										originalMap.sources[i].split(sep).join("/") :
										this.relativePath(originalMap.sources[i]) :
									relativePath(mapOutDir, originalMap.sources[i])
						}
						if (this.sourceMapOptions.includeSourcesContent) {
							mapObject.sourcesContent = []
							for (let i = 0; i < originalMap.sources.length; i++) {
								let sourcesContent = originalMap.sourcesContent && originalMap.sourcesContent[i]
								if (sourcesContent == undefined) {
									sourcesContent = await (this.sourceMapOptions.sourceContent ? this.sourceMapOptions.sourceContent(originalMap.sources[i], mapPath, module, this) : this.fs.readFile(originalMap.sources[i], this.encoding))
								}
								mapObject.sourcesContent[i] = sourcesContent
							}
						}
					}
					if (this.sourceMapOptions.includeNames && originalMap.names && originalMap.names.length) {
						mapObject.names = originalMap.names
					}
					mapObject.mappings = originalMap.mappings || ""
					const mapString = JSON.stringify(mapObject, undefined, this.sourceMapOptions.indent)
					const mapURL = this.sourceMapOptions.inline ?
						encodeDataURI("application/json", mapString) :
						this.sourceMapOptions.url ? this.sourceMapOptions.url(mapPath, module, this) : generatedModule.relativePath(mapPath)
					if (mapURL) {
						if (generatedModule.data === undefined) {
							await this.readModule(module, true, "SourceMap")
						}
						generatedModule.content += createSourceMappingURLComment(mapURL, generatedModule.type === "text/javascript")
					}
					if (!this.sourceMapOptions.inline) {
						module.addGenerated(mapPath, mapString).type = "application/json"
					}
					// 释放内存
					generatedModule.sourceMapObject = undefined
				}
			}
			// 保存模块
			for (const child of module.generatedModules) {
				await this.writeModule(child, generatedModule)
			}
			// 添加到生成列表
			module.promise = undefined
			module.state = ModuleState.emitted
			// 添加监听
			if (this.watcher) {
				this.watcher.addModule(generatedModule)
			}
			await this.emit("emitModule", module)
			await this.reportLogs(generatedModule)
		} finally {
			this.deferred.resolve()
		}
	}

	/** 判断是否跳过检查输出的路径，即是否允许生成的模块保存到 `outDir` 外、生成的模块覆盖源模块 */
	readonly noPathCheck: boolean

	/** 获取生成的所有模块，键为生成模块的绝对路径，值为对应的模块对象 */
	readonly emittedModules = new Map<string, GeneratedModule>()

	/**
	 * 保存指定的模块
	 * @param generatedModule 要保存的模块
	 * @param module 原始模块
	 */
	protected async writeModule(generatedModule: GeneratedModule, module: Module) {
		if (generatedModule.generatedModules) {
			for (const child of generatedModule.generatedModules) {
				await this.writeModule(child, module)
			}
		}
		if (generatedModule.noWrite) {
			return
		}
		const outPath = this.getOutputPath(generatedModule.path)
		// 检查路径
		if (!this.noPathCheck) {
			if (generatedModule.bufferOrContent !== undefined && pathEquals(outPath, generatedModule.originalModule!.originalPath, this.fs.isCaseInsensitive)) {
				generatedModule.noWrite = true
				module.addError(i18n`The output path is same as source file`)
				return
			}
			if (!containsPath(this.outDir, outPath, this.fs.isCaseInsensitive)) {
				generatedModule.noWrite = true
				module.addError(i18n`Cannot write files outside the outDir '${this.logger.formatPath(this.outDir)}': '${this.logger.formatPath(outPath)}'`)
				return
			}
		}
		// 检查路径冲突
		const exists = this.emittedModules.get(generatedModule.path)
		if (exists) {
			generatedModule.noWrite = true
			module.addError(i18n`Output path conflicts with '${this.logger.formatPath(exists.originalModule!.originalPath)}': '${this.logger.formatPath(outPath)}'`)
			// 互相引用，如果任一个模块删除，则重新生成模块
			if (this.watcher) {
				this.watcher.addDependency(module.originalModule!, exists.originalModule!, true)
				this.watcher.addDependency(exists.originalModule!, module.originalModule!, true)
			}
			return
		}
		this.emittedModules.set(generatedModule.path, generatedModule)
		// 保存模块
		if (!this.noWrite) {
			if (generatedModule.bufferOrContent !== undefined) {
				const writingTask = this.logger.begin(i18n`Writing`, this.logger.formatPath(outPath))
				try {
					await this.fs.writeFile(outPath, generatedModule.bufferOrContent)
				} catch (e) {
					module.addError({
						message: `Cannot write file: ${e.message}`,
						error: e
					})
				} finally {
					this.logger.end(writingTask)
				}
			} else if (!pathEquals(outPath, generatedModule.originalModule!.originalPath, this.fs.isCaseInsensitive)) {
				const copyingTask = this.logger.begin(i18n`Copying`, this.logger.formatPath(outPath))
				try {
					await this.fs.copyFile(generatedModule.originalModule!.originalPath, outPath)
				} catch (e) {
					module.addError({
						message: `Cannot copy file: ${e.message}`,
						error: e
					})
				} finally {
					this.logger.end(copyingTask)
				}
			}
		}
		await this.emit("writeModule", generatedModule)
	}

	/**
	 * 计算一个绝对路径的最终输出绝对路径
	 * @param path 要计算的绝对路径
	 */
	getOutputPath(path: string) {
		return setDir(path, this.outDir, this.rootDir)
	}

	// #endregion

	// #region 日志

	/** 判断是否在出现第一个错误后终止构建 */
	readonly bail: boolean

	/**
	 * 报告指定模块的错误和警告
	 * @param module 要处理的模块
	 */
	protected async reportLogs(module: Module) {
		if (module.logs) {
			for (const log of module.logs) {
				if (this.context) {
					if (log.level === LogLevel.error) {
						this.context.errorCount++
					} else if (log.level === LogLevel.warning) {
						this.context.warningCount++
					}
				}
				if (log.codeFrame === undefined && log.line !== undefined && log.fileName) {
					try {
						log.codeFrame = formatCodeFrame(await this.fs.readFile(log.fileName, this.encoding), log.line, log.column, log.endLine, log.endColumn)
					} catch (e) {
						this.logger.debug(e)
					}
				}
				if (!await this.emit("buildLog", log, module)) {
					continue
				}
				if (this.bail && log.level === LogLevel.error) {
					throw new Error(i18n`Error found in '${log.fileName}': ${log.message}`)
				}
				this.logger.write(log, log.level!)
			}
		}
	}

	// #endregion

	// #region 安装

	/** 获取使用的包管理器 */
	readonly packageManager: PackageManager

	/**
	 * 载入一个包
	 * @param name 要载入的包
	 */
	async require(name: string) {
		return require(await this.resolvePackage(name, true))
	}

	/**
	 * 解析一个包
	 * @param name 要解析的包
	 * @param devDependency 安装依赖时是否安装为开发依赖
	 */
	async resolvePackage(name: string, devDependency?: boolean) {
		return await this.packageManager.resolve(name, this.baseDir, devDependency) || (/^\.+[\/\\]/.test(name) ? this.resolvePath(name) : name)
	}

	/**
	 * 安装一个包
	 * @param name 要安装的包
	 * @param devDependency 安装依赖时是否安装为开发依赖
	 */
	async installPackage(name: string, devDependency?: boolean) {
		return await this.packageManager.install(name, this.baseDir, devDependency)
	}

	// #endregion

}

/** 表示一个构建上下文 */
export class BuildContext {

	/** 判断本次构建是否是全量构建 */
	readonly fullBuild: boolean

	/**
	 * 初始化新的构建上下文
	 * @param fullBuild 是否正在执行全量构建
	 */
	constructor(fullBuild: boolean) {
		this.fullBuild = fullBuild
	}

	/** 获取本次构建的所有入口模块 */
	readonly entryModules: Module[] = []

	/** 获取本次构建的开始时间 */
	readonly startTime = process.hrtime()

	/** 获取构建所经过的时间 */
	get elapsedTime() { return process.hrtime(this.startTime) }

	/** 获取构建所经过的时间（字符串形式） */
	get elapsedTimeString() { return formatHRTime(this.elapsedTime) }

	/** 获取本次构建要处理的总任务数 */
	totalTaskCount = 0

	/** 获取本次构建已处理的任务数 */
	doneTaskCount = 0

	/** 获取当前的进度（0-100） */
	get progress() { return this.totalTaskCount === 0 ? 0 : this.doneTaskCount * 100 / this.totalTaskCount }

	/** 获取本次构建累积的错误数 */
	errorCount = 0

	/** 获取本次构建累积的警告数 */
	warningCount = 0

}