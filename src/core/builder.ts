import { readFileSync } from "fs"
import { sep } from "path"
import { getExtByMimeType, getMimeType } from "../server/mimeTypes"
import { ANSIColor, color } from "../utils/ansi"
import { encodeDataURI } from "../utils/base64"
import { Deferred } from "../utils/deferred"
import { EventEmitter } from "../utils/eventEmitter"
import { FileSystem } from "../utils/fileSystem"
import { Matcher, MatcherOptions, Pattern } from "../utils/matcher"
import { escapeRegExp, formatDate, formatHRTime, insertSorted, randomString } from "../utils/misc"
import { appendName, containsPath, deepestPath, getDir, pathEquals, relativePath, resolvePath, setDir } from "../utils/path"
import { createSourceMappingURLComment, SourceMapObject } from "../utils/sourceMap"
import { i18n } from "./i18n"
import { Logger, LogLevel } from "./logger"
import { BuilderOptions, Bundler, checkBuilderOptions, ExternalFileRule, Processor, ProcessorFactory, ProcessorRule } from "./options"
import { installPackage, resolve } from "./require"
import { Server } from "./server"
import { VFile, VFileState } from "./vfile"
import { Watcher } from "./watcher"

/** 表示一个文件构建器 */
export class Builder extends EventEmitter {

	// #region 选项

	/** 获取构建器的原始选项 */
	readonly options: BuilderOptions

	/** 获取构建器的基文件夹绝对路径（即工作目录）*/
	readonly baseDir: string

	/** 获取需要构建的源文件夹绝对路径 */
	readonly rootDir: string

	/** 获取配置中所有通配符的选项 */
	readonly globOptions?: MatcherOptions

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

		const baseDir = this.baseDir = resolvePath(options.baseDir || ".")
		this.rootDir = resolvePath(baseDir, options.rootDir != undefined ? options.rootDir : "src")
		this.outDir = resolvePath(baseDir, options.outDir != undefined ? options.outDir : "dist")

		this.globOptions = {
			cwd: baseDir,
			ignoreCase: false,
			...options.glob
		}
		this.matcher = this.createMatcher(options.match || "**/*", options.exclude != undefined ? options.exclude : ["**/node_modules/**"])
		// 如果源目录包含生成目录，自动排除生成目录
		if (containsPath(this.rootDir, this.outDir)) {
			this.matcher.exclude(this.outDir)
		}
		this.filter = options.filter != undefined ? this.createMatcher(options.filter) : undefined

		this.autoInstall = options.installCommand !== false
		this.installCommand = options.installCommand || "npm install <package> --colors"

		this.encoding = options.encoding || "utf-8"
		this.noPathCheck = !!options.noPathCheck
		this.noWrite = options.noWrite !== undefined ? options.noWrite : !!options.devServer && !options.watch
		this.parallel = options.parallel || 1
		this.fs = options.fs || new FileSystem()

		this.clean = options.clean !== false && !this.noWrite && !this.filter && !containsPath(this.outDir, this.rootDir)
		this.sourceMap = options.sourceMap !== undefined ? !!options.sourceMap : !options.optimize
		const sourceMapOptions = options.sourceMap
		this.sourceMapOptions = sourceMapOptions == undefined || typeof sourceMapOptions === "boolean" ? { includeFile: true, includeNames: true } : {
			outPath: typeof sourceMapOptions.outPath === "string" ? (file, builder) => builder.formatPath(sourceMapOptions.outPath as string, file) : sourceMapOptions.outPath,
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
		this.reporter = options.reporter === undefined || options.reporter === "summary" ? this.summaryReporter : options.reporter ? typeof options.reporter === "function" ? options.reporter : this.detailReporter : undefined

		const bundlerOptions = options.bundler || {}
		this.externalModules = (bundlerOptions.externalModules || JSON.parse(readFileSync(`${__dirname}/../configs/externalModules.json`, "utf-8")) as ExternalFileRule[]).map(externalFile => ({
			matcher: externalFile.match != undefined || externalFile.exclude != undefined ? this.createMatcher(externalFile.match || (() => true), externalFile.exclude) : undefined,
			matchType: externalFile.matchType != undefined ? new RegExp(`^${escapeRegExp(externalFile.matchType).replace(/\*/g, ".*")}$`) : undefined,
			minSize: externalFile.minSize || 0,
			outPath: typeof externalFile.outPath === "string" ? (file: VFile, builder: Builder) => {
				const originalOutPath = builder.relativePath(builder.formatPath(externalFile.outPath as string, file))
				const exists = builder.emittedFiles.get(originalOutPath)
				if (!exists || exists === file) {
					return originalOutPath
				}
				for (let i = 2; ; i++) {
					const newPath = appendName(originalOutPath, `-${i}`)
					const exists = builder.emittedFiles.get(newPath)
					if (!exists || exists === file) {
						return newPath
					}
				}
			} : externalFile.outPath
		}))

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

		if (options.watch || options.devServer) {
			this.watcher = new Watcher(this, typeof options.watch === "object" ? options.watch : undefined)
		}
		if (options.devServer) {
			this.server = new Server(this, options.devServer === true ? undefined : typeof options.devServer === "object" ? options.devServer : { url: options.devServer })
		}

		this.compilerRoot = resolveProcessorRules.call(this, options.compilers || getDefaultProcessors("../configs/compilers.json"), "compilers")
		this.optimizerRoot = options.optimize ? resolveProcessorRules.call(this, options.optimizers || getDefaultProcessors("../configs/optimizers.json"), "optimizers") : undefined

		if (options.plugins) {
			for (const plugin of options.plugins) {
				plugin.apply(this)
			}
		}

		/** 读取默认解析器规则 */
		function getDefaultProcessors(configPath: string) {
			const processors = JSON.parse(readFileSync(`${__dirname}/${configPath}`, "utf-8")) as ProcessorRule[]
			processors.forEach(rule => rule.use = resolvePath(__dirname, rule.use as string))
			return processors
		}

		/** 初始化所有处理器规则 */
		function resolveProcessorRules(this: Builder, rules: (ProcessorRule | false | null | undefined)[], name: string, breakTarget?: ResolvedProcessorRule) {
			let last = breakTarget
			for (let i = rules.length - 1; i >= 0; i--) {
				const rule = rules[i]
				if (!rule) {
					continue
				}
				const id = `${name}[${i}]`
				const resolved: ResolvedProcessorRule = {
					matcher: rule.match != undefined || rule.exclude != undefined ? this.createMatcher(rule.match || (() => true), rule.exclude) : undefined
				}
				let nextTrue = rule.break ? breakTarget : last
				if (typeof rule.process === "function") {
					resolved.processor = rule as Processor
					resolved.options = rule.options !== undefined ? rule.options : {}
					resolved.name = rule.name || id
				} else if (typeof rule.use === "string") {
					resolved.use = rule.use
					resolved.options = rule.options !== undefined ? rule.options : {}
					resolved.name = rule.name
				} else if (Array.isArray(rule.use)) {
					nextTrue = resolveProcessorRules.call(this, rule.use, id, nextTrue)
					resolved.name = rule.name || id
				} else if (rule.use) {
					resolved.options = rule.options !== undefined ? rule.options : {}
					const instance = new rule.use(resolved.options, this)
					if (typeof instance.process !== "function") {
						throw new Error(i18n`'new ${id}.use().process' is not a function`)
					}
					resolved.processor = instance
					resolved.name = rule.name || instance.name || rule.use.name || id
				} else {
					resolved.name = rule.name || id
				}
				if (rule.outPath != undefined) {
					resolved.outPath = typeof rule.outPath === "string" ? (file, builder) => builder.formatPath(rule.outPath as string, file, resolved.matcher && resolved.matcher.base || undefined) : rule.outPath
				}
				resolved.nextTrue = nextTrue
				resolved.nextFalse = last
				last = resolved
			}
			return last
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
		const matcher = new Matcher(match, this.globOptions)
		if (exclude) {
			matcher.exclude(exclude)
		}
		return matcher
	}

	/**
	 * 替换设置的输出路径中的变量
	 * @param outPath 用户设置的输出路径
	 * @param file 相关的文件
	 * @param baseDir 基路径
	 */
	formatPath(outPath: string, file: VFile, baseDir = this.rootDir) {
		return outPath.replace(/<(\w+)(?::(\d+))?>/g, (source, key, argument) => {
			switch (key) {
				case "path":
					return relativePath(baseDir, file.path)
				case "dir":
					return relativePath(baseDir, file.dir)
				case "name":
					return file.name
				case "ext":
					return file.ext
				case "hash":
					return file.hash.slice(0, +argument || 8)
				case "md5":
					return (file.md5 || "").slice(0, +argument || 8)
				case "sha1":
					return (file.sha1 || "").slice(0, +argument || 8)
				case "date":
					return argument ? new Date().toLocaleString() : formatDate(new Date(), argument)
				case "random":
					return randomString(+argument || 8)
				case "buildhash":
					return this.context ? this.context.hash.slice(0, +argument || 8) : ""
				case "version":
					return this.version
			}
			return source
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

	/** 如果需要监听文件并自动重新构建，则为使用的监听器，否则为 `undefined` */
	readonly watcher?: Watcher

	/** 如果需要启动本地 HTTP 服务器以浏览编译后的文件，则为使用的服务器，否则为 `undefined` */
	readonly server?: Server

	/**
	 * 根据当前配置启动构建器
	 * @returns 返回打包的错误数
	 */
	async run() {
		// 优先启动服务器，以便优先构建用户请求的文件
		if (this.server) {
			await this.server.start()
		}
		// 启动监听器
		if (this.watcher) {
			await this.watcher.start()
			return 0
		}
		// 执行完整流程
		return (await this.build()).errorCount
	}

	// #endregion

	// #region 全量构建

	/** 判断是否在构建前清理生成文件夹 */
	readonly clean: boolean

	/** 判断是否仅构建但不保存文件到目标文件夹 */
	readonly noWrite: boolean

	/** 匹配本次要构建文件的匹配器 */
	readonly filter?: Matcher

	/** 当前构建的上下文 */
	context?: BuildContext

	/** 判断是否正在构建 */
	get isBuilding() { return !!this.context }

	/**
	 * 构建整个项目
	 * @param buildMode 本次构建的模式
	 * @param files 如果是增量构建则为待构建的所有文件
	 * @param report 是否向用户报告构建结果
	 * @returns 返回包含本次构建信息的对象
	 */
	async build(buildMode = BuildMode.full, files?: Iterable<VFile>, report = true) {
		const context = this.context = new BuildContext(buildMode)
		const buildingTask = this.logger.begin(i18n`Building`)
		try {
			// 第一步：准备开始
			this.logger.progressPercent(context.progress)
			await this.emit("buildStart", context)

			// 第二步：清理目标文件夹
			if (buildMode === BuildMode.full && this.clean) {
				const cleaningTask = this.logger.begin(i18n`Cleaning`, this.logger.formatPath(this.outDir))
				try {
					await this.fs.cleanDir(this.outDir)
				} finally {
					this.logger.end(cleaningTask)
				}
			}

			// 第三步：搜索入口文件
			const scanningTask = this.logger.begin(i18n`Scanning`, this.logger.formatPath(this.rootDir))
			const entryFiles = context.files
			try {
				const filter = this.filter
				if (buildMode !== BuildMode.incremental) {
					let filtered = false
					const matcher = this.matcher
					// 选择层次最深的文件夹开始遍历，减少扫描次数
					let walkPath = deepestPath(this.rootDir, matcher.base, this.fs.isCaseInsensitive)
					if (filter) {
						walkPath = deepestPath(walkPath, filter.base, this.fs.isCaseInsensitive)
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
									// 初始化文件
									const file = new VFile(path, false)
									file.sourceMap = this.sourceMap
									if (buildMode === BuildMode.pathOnly) {
										file.noData = true
										file.data = ""
									}
									this.files.set(path, file)
									// 为了确保每次打包处理结果完全一致，对 entryFiles 的文件按路径排序
									insertSorted(entryFiles, file, (x, y) => x.originalPath <= y.originalPath)
								}
							}
						})
					}
					if (!entryFiles.length && filtered) {
						this.logger.warning(i18n`No files match the current filter`)
						context.warningCount++
					}
				} else {
					// 如果是第二次构建，不需要扫描磁盘
					for (const file of files || this.files.values()) {
						if (file.isExternal || file.state !== VFileState.initial) {
							continue
						}
						if (filter && !filter.test(file.originalPath)) {
							continue
						}
						insertSorted(entryFiles, file, (x, y) => x.originalPath <= y.originalPath)
					}
				}
				// 任务数 = 搜索任务 + 所有文件编译任务 + 打包任务 + 所有文件保存任务
				context.doneTaskCount = 1
				context.totalTaskCount = entryFiles.length * 2 + 2
				this.logger.progressPercent(context.progress)
			} finally {
				this.logger.end(scanningTask)
			}

			// 第四步：加载（编译、解析）入口文件及其依赖
			const loadingTask = this.logger.begin(i18n`Loading files`)
			try {
				// 理论上，加载一个文件，需要等待其依赖和依赖的依赖都加载完成
				// 但如果有循环依赖，就会导致互相等待，为简化复杂度
				// 改用全局计数器的方式，等待所有文件都加载完毕，可以避免循环依赖问题
				let error: any
				for (const file of entryFiles) {
					this.loadFile(file).then(() => {
						context.doneTaskCount++
						this.logger.progressPercent(context.progress)
					}, e => {
						if (error === undefined) {
							error = e
						}
					})
					// 为避免载入进程阻塞程序，每次载入时中断一次
					await new Promise(setImmediate)
				}
				await this.loadDeferred
				if (error !== undefined) {
					throw error
				}
			} finally {
				this.logger.end(loadingTask)
			}

			// 第五步：提取公共文件
			const bundlingTask = this.logger.begin(i18n`Bundling files`)
			try {
				for (const key in this.bundlers) {
					const bundler = this.bundlers[key]
					if (bundler && bundler.bundle) {
						await bundler.bundle(entryFiles, this)
					}
				}
				context.doneTaskCount++
				this.logger.progressPercent(context.progress)
			} finally {
				this.logger.end(bundlingTask)
			}

			// 第六步：最终生成（生成、优化、保存）入口文件
			const emittingTask = this.logger.begin(i18n`Emitting files`)
			try {
				// 在生成一个文件时需要先生成其依赖，如果并行生成文件，就会出现依赖正在生成的情况
				// 为降低复杂度，串行生成所有文件
				const writingPromises: Promise<void>[] = []
				for (const file of entryFiles) {
					if (file.noWrite) {
						continue
					}
					await this.emitFile(file)
					if (this.noWrite || buildMode === BuildMode.pathOnly) {
						if (buildMode === BuildMode.pathOnly) {
							file.reset(VFileState.initial)
						}
						context.doneTaskCount++
						this.logger.progressPercent(context.progress)
					} else {
						writingPromises.push(this.writeFile(file).then(() => {
							context.doneTaskCount++
							this.logger.progressPercent(context.progress)
						}))
					}
					// 为避免载入进程阻塞程序，每次生成中断一次
					await new Promise(setImmediate)
				}
				await Promise.all(writingPromises)
			} finally {
				this.logger.end(emittingTask)
			}

			// 第七步：完成构建
			await this.emit("buildEnd", context)
		} finally {
			this.logger.end(buildingTask)
			this.context = undefined
		}
		if (report && this.reporter && !context.aborted) {
			this.reporter(context, this)
		}
		return context
	}

	/**
	 * 终止本次构建
	 * @returns 如果终止成功则返回本次构建的上下文，否则返回 `undefined`
	 */
	abortBuild(): Promise<BuildContext | undefined> {
		// 将所有文件标记为已更新，构建流程将会自然终止
		const context = this.context
		if (context) {
			return new Promise<BuildContext>(resolve => {
				const onBuildEnd = async (context: BuildContext) => {
					this.off("buildEnd", onBuildEnd)
					for (const file of context.files) {
						if (file.state === VFileState.changing) {
							if (this.watcher) {
								await this.watcher.resetFile(file)
							} else {
								if (file.hasErrors || file.hasWarnings) {
									this.filesWithLog.delete(file)
								}
								await this.emit("resetFile", file)
								file.reset(VFileState.initial)
							}
						}
					}
					resolve(context)
				}
				this.on("buildEnd", onBuildEnd)
				for (const file of context.files) {
					if (file.state === VFileState.loading || file.state === VFileState.loaded || file.state === VFileState.emitting) {
						file.state = VFileState.changing
					}
				}
			})
		}
		return Promise.resolve(context)
	}

	// #endregion

	// #region 加载文件

	/** 获取所有文件，键为文件的原始绝对路径 */
	readonly files = new Map<string, VFile>()

	/**
	 * 获取指定源路径对应的文件
	 * @param path 文件的原始绝对路径
	 */
	getFile(path: string) {
		let file = this.files.get(path)
		if (file === undefined) {
			file = new VFile(path, this.isExternalPath(path))
			file.sourceMap = this.sourceMap
			this.files.set(path, file)
		}
		return file
	}

	/**
	 * 判断指定的路径是否是外部路径
	 * @param path 要判断的绝对路径
	 */
	isExternalPath(path: string) {
		return !containsPath(this.rootDir, path, this.fs.isCaseInsensitive) || !this.matcher.test(path)
	}

	/** 确保所有文件都加载完成后继续 */
	readonly loadDeferred = new Deferred()

	/** 所有文件打包器 */
	readonly bundlers: { [ext: string]: Bundler | false } = Object.create(null)

	/**
	 * 加载指定的文件
	 * @param file 要加载的文件
	 */
	async loadFile(file: VFile) {
		// 避免重复加载
		if (file.state !== VFileState.initial) {
			return
		}
		try {
			this.loadDeferred.reject()
			file.state = VFileState.loading
			// 编译文件
			await this.processFile(this.compilerRoot, file)
			if (file.state !== VFileState.loading) {
				if (this.context) this.context.aborted = true
				return
			}
			// 绑定打包器
			let bundler = file.bundler
			if (bundler === undefined) {
				file.bundler = bundler = this.bundlers[file.ext.toLowerCase()]
			}
			// 解析文件
			if (bundler && bundler.parse) {
				if (file.data === undefined && bundler.read !== false) {
					if (!await this.readFile(file, bundler.read === "text", i18n`Bundler`)) {
						file.data = ""
					}
					if (file.state !== VFileState.loading) {
						if (this.context) this.context.aborted = true
						return
					}
				}
				const parsingTask = this.logger.begin(i18n`Parsing`, this.logger.formatPath(file.originalPath))
				try {
					await bundler.parse(file, this)
				} catch (e) {
					file.addError({
						source: i18n`Bundler`,
						error: e
					})
				} finally {
					this.logger.end(parsingTask)
				}
				if (file.state !== VFileState.loading) {
					if (this.context) this.context.aborted = true
					return
				}
			}
			// 加载完成
			file.state = VFileState.loaded
			// 监听文件
			if (this.watcher) {
				this.watcher.addFile(file)
			}
			await this.emit("loadFile", file)
			await this.reportLogs(file)
		} finally {
			this.loadDeferred.resolve()
		}
	}

	// #endregion

	// #region 处理文件

	/** 获取编译器链表根节点 */
	readonly compilerRoot?: ResolvedProcessorRule

	/** 获取优化器链表根节点 */
	readonly optimizerRoot?: ResolvedProcessorRule

	/** 获取多核并行处理器个数 */
	readonly parallel: number // TODO：支持多核处理

	/**
	 * 使用指定的处理器处理文件
	 * @param processorRule 要使用的处理器规则
	 * @param file 要处理的文件
	 */
	async processFile(processorRule: ResolvedProcessorRule | undefined, file: VFile) {
		const state = file.state
		// 如果在处理过程状态发生变化，则不再需要这次处理结果，立即返回
		while (processorRule) {
			// 跳过不匹配的处理器
			if (processorRule.matcher && !processorRule.matcher.test(file.path, file, this)) {
				processorRule = processorRule.nextFalse
				continue
			}
			if (processorRule.processor || processorRule.use) {
				// 加载处理器插件
				if (!processorRule.processor) {
					try {
						let factory = await this.require(processorRule.use!) as ProcessorFactory | { __esModule: true, default: ProcessorFactory }
						// 如果有多个文件都需要使用此处理器，第一次会加载处理器并创建处理器实例，下一次只需等待
						if (!processorRule.processor) {
							// 支持 ES6 文件
							if (typeof factory === "object" && factory && factory.__esModule && "default" in factory) {
								factory = factory.default
							}
							if (typeof factory !== "function") {
								throw new Error(i18n`'module.exports' is not a class`)
							}
							const instance = new factory(processorRule.options, this)
							if (typeof instance.process !== "function") {
								throw new Error(i18n`'new ${factory.name || "module.exports"}().process' is not a function`)
							}
							processorRule.processor = instance
							if (!processorRule.name) {
								processorRule.name = instance.name || factory.name || processorRule.use
							}
						}
					} catch (e) {
						// 避免重复报告插件加载失败的错误
						if (!processorRule.processor) {
							processorRule.processor = {
								read: false,
								process(file) {
									file.addWarning({
										message: i18n`Skipped, cannot load plugin '${processorRule!.use!}': ${e.message || e}`,
										error: e,
										showStack: false
									})
								}
							}
							file.addError({
								message: i18n`Skipped, cannot load plugin '${processorRule.use!}': ${e.message || e}`,
								error: e,
								showStack: true
							})
							break
						}
					}
					if (file.state !== state) {
						if (this.context) this.context.aborted = true
						return
					}
				}
				// 读取文件内容
				if (file.data === undefined && processorRule.processor.read !== false) {
					if (!await this.readFile(file, processorRule.processor.read === "text", processorRule.name!)) {
						break
					}
					if (file.state !== state) {
						if (this.context) this.context.aborted = true
						return
					}
				}
				// 处理文件
				const processingTask = this.logger.begin(processorRule.name!, this.logger.formatPath(file.originalPath))
				try {
					await processorRule.processor.process(file, processorRule.options, this)
				} catch (e) {
					file.addError({
						source: processorRule.name,
						error: e
					})
					break
				} finally {
					this.logger.end(processingTask)
				}
				if (file.state !== state) {
					if (this.context) this.context.aborted = true
					return
				}
				if (file.hasErrors) {
					break
				}
			}
			// 计算输出路径
			if (processorRule.outPath) {
				file.path = this.resolvePath(processorRule.outPath(file, this))
			}
			processorRule = processorRule.nextTrue
		}
	}

	/** 获取读取文本文件内容时，默认使用的文件编码 */
	readonly encoding: string

	/**
	 * 读取文件的内容
	 * @param file 要读取的文件
	 * @param text 是否以文本方式读取
	 * @param source 读取的来源
	 * @returns 如果读取成功则返回 `true`，否则返回 `false`
	 */
	async readFile(file: VFile, text?: boolean, source?: string) {
		const readingTask = this.logger.begin(i18n`Reading`, this.logger.formatPath(file.originalPath))
		try {
			if (text) {
				file.data = await this.fs.readFile(file.originalPath, this.encoding)
			} else {
				file.data = await this.fs.readFile(file.originalPath)
			}
		} catch (e) {
			file.addError({
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

	// #endregion

	// #region 生成文件

	/** 提取外部模块的规则 */
	readonly externalModules: {
		/** 匹配的文件匹配器 */
		matcher?: Matcher
		/** 匹配的 MIME 类型 */
		matchType?: RegExp
		/** 提取的最小字节大小  */
		minSize: number
		/**
		 * 获取提取的路径的回调函数
		 * @param file 待提取的文件
		 * @param builder 当前的构建器对象
		 */
		outPath: (file: VFile, builder: Builder) => string
	}[]

	/** 判断是否需要生成源映射（Source Map）*/
	readonly sourceMap: boolean

	/** 获取生成源映射（Source Map）的选项 */
	readonly sourceMapOptions: {
		/**
		 * 获取源映射保存路径的回调函数
		 * @param file 源文件对象
		 * @param builder 当前构建器的对象
		*/
		readonly outPath?: (file: VFile, builder: Builder) => string
		/** 源映射中所有源文件的根地址 */
		readonly sourceRoot?: string
		/**
		 * 获取每个源文件地址的回调函数
		 * @param sourcePath 源文件绝对路径
		 * @param sourceMapPath 源映射绝对路径
		 * @param file 源文件对象
		 * @param builder 当前构建器的对象
		 */
		readonly source?: (sourcePath: string, sourceMapPath: string, file: VFile, builder: Builder) => string
		/**
		 * 获取每个源文件内容的回调函数
		 * @param sourcePath 源文件绝对路径
		 * @param sourceMapPath 源映射绝对路径
		 * @param file 源文件对象
		 * @param builder 当前构建器的对象
		 */
		readonly sourceContent?: (sourcePath: string, sourceMapPath: string, file: VFile, builder: Builder) => string | Promise<string>
		/** 判断是否在源映射中内联源内容 */
		readonly includeSourcesContent?: boolean
		/** 判断是否在源映射中包含目标文件字段 */
		readonly includeFile?: boolean
		/** 判断是否在源映射中包含符号名称字段 */
		readonly includeNames?: boolean
		/** 生成源映射的缩进字符串或缩进空格数，如果为空或 0 则不缩进 */
		readonly indent?: string | number
		/**
		 * 获取在生成的文件中插入的指向源映射的地址的回调函数
		 * @param sourceMapPath 源映射的最终保存绝对路径
		 * @param file 源文件对象
		 * @param builder 当前构建器的对象
		 * @returns 返回地址，如果为空则不生成源映射注释
		 */
		readonly url?: (sourceMapPath: string, file: VFile, builder: Builder) => string | false | null
		/** 判断是否将源映射内联到生成的文件中 */
		readonly inline?: boolean
	}

	/**
	 * 生成指定的文件
	 * @param file 要生成的文件
	 */
	async emitFile(file: VFile) {
		// 避免重复生成
		if (file.state !== VFileState.loaded) {
			return
		}
		file.state = VFileState.emitting
		if (!file.type) file.type = this.getMimeType(file.path)
		// 合成文件
		const bundler = file.bundler
		if (bundler && bundler.generate) {
			const generatingTask = this.logger.begin(i18n`Generating`, this.logger.formatPath(file.originalPath))
			try {
				await bundler.generate(file, this)
			} catch (e) {
				file.addError({
					source: i18n`Bundler`,
					error: e
				})
			} finally {
				this.logger.end(generatingTask)
			}
			if (file.state !== VFileState.emitting) {
				if (this.context) this.context.aborted = true
				return
			}
		}
		// 优化文件
		if (this.optimizerRoot && !file.hasErrors) {
			await this.processFile(this.optimizerRoot, file)
		}
		// 复制外部模块
		if (file.isExternal) {
			let inline = true
			for (const externalFile of this.externalModules) {
				if (externalFile.matcher && !externalFile.matcher.test(file.path, file, this)) {
					continue
				}
				if (externalFile.matchType && !externalFile.matchType.test(file.type)) {
					continue
				}
				if (externalFile.minSize) {
					if (file.data === undefined) {
						const stat = await this.fs.getStat(file.originalPath)
						if (stat.size < externalFile.minSize) {
							continue
						}
					} else {
						// 计算 file.size 性能较差，计算 file.data.length 性能较高
						// file.size >= file.data.length，如果 file.data.length > minSize，则无需计算 file.size
						if ((typeof file.data === "string" || file.data instanceof Buffer ? file.data.length : 0) < externalFile.minSize && file.size < externalFile.minSize) {
							continue
						}
					}
				}
				file.path = this.resolvePath(externalFile.outPath(file, this))
				inline = false
				break
			}
			if (inline) {
				file.noWrite = true
			}
		}
		// 计算源映射
		if (file.sourceMap) {
			const originalMap = file.sourceMapObject
			if (originalMap) {
				const mapPath = this.sourceMapOptions.inline ? file.path : this.sourceMapOptions.outPath ? this.resolvePath(this.sourceMapOptions.outPath(file, this)) : file.path + ".map"
				const mapDir = getDir(mapPath)
				const mapOutDir = this.getOutputPath(mapDir)
				const mapObject = {
					version: originalMap.version || 3
				} as SourceMapObject
				if (this.sourceMapOptions.includeFile) {
					mapObject.file = relativePath(mapDir, file.path)
				}
				if (this.sourceMapOptions.sourceRoot !== undefined) {
					mapObject.sourceRoot = this.sourceMapOptions.sourceRoot
				}
				if (originalMap.sources) {
					mapObject.sources = []
					for (let i = 0; i < originalMap.sources.length; i++) {
						mapObject.sources[i] = this.sourceMapOptions.source ?
							this.sourceMapOptions.source(originalMap.sources[i], mapPath, file, this) :
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
								sourcesContent = await (this.sourceMapOptions.sourceContent ? this.sourceMapOptions.sourceContent(originalMap.sources[i], mapPath, file, this) : this.fs.readFile(originalMap.sources[i], this.encoding))
							}
							mapObject.sourcesContent[i] = sourcesContent
						}
					}
				}
				if (this.sourceMapOptions.includeNames && originalMap.names && originalMap.names.length) {
					mapObject.names = originalMap.names
				}
				mapObject.mappings = originalMap.mappings || ""
				const mapString = file.sourceMapData = JSON.stringify(mapObject, undefined, this.sourceMapOptions.indent)
				const mapURL = this.sourceMapOptions.inline ?
					encodeDataURI("application/json", mapString) :
					this.sourceMapOptions.url ? this.sourceMapOptions.url(mapPath, file, this) : file.relativePath(mapPath)
				if (mapURL) {
					if (file.data === undefined) {
						await this.readFile(file, true, "SourceMap")
					}
					file.content += createSourceMappingURLComment(mapURL, file.type === "text/javascript")
				}
				if (!this.sourceMapOptions.inline) {
					file.addSibling(mapPath, mapString).type = "application/json"
				}
			}
		}
		// 添加到生成列表
		if (file.state !== VFileState.emitting) {
			if (this.context) this.context.aborted = true
			return
		}
		file.state = VFileState.emitted
		this._addToEmittedFiles(file, file)
		// 添加监听
		if (this.watcher) {
			this.watcher.addFile(file)
		}
		await this.emit("emitFile", file)
		await this.reportLogs(file)
	}

	/** 判断是否跳过检查输出的路径，即是否允许生成的文件保存到 `outDir` 外、生成的文件覆盖源文件 */
	readonly noPathCheck: boolean

	/** 获取生成的所有文件，键为生成文件相对于根目录的相对路径，值为对应的文件对象 */
	readonly emittedFiles = new Map<string, VFile>()

	/**
	 * 添加一个文件到生成列表
	 * @param file 生成的文件
	 * @param originalFile 原始文件
	 */
	private _addToEmittedFiles(file: VFile, originalFile: VFile) {
		// 添加兄弟文件
		if (file.siblings) {
			for (const sibling of file.siblings) {
				this._addToEmittedFiles(sibling, originalFile)
			}
		}
		// 跳过生成文件
		if (file.noWrite) {
			return
		}
		// 检查路径
		if (!this.noPathCheck) {
			if (file.data !== undefined && pathEquals(originalFile.originalPath, this.getOutputPath(file.path), this.fs.isCaseInsensitive)) {
				file.noWrite = true
				originalFile.addError(i18n`The output path is same as source file`)
			} else if (!containsPath(this.rootDir, file.path, this.fs.isCaseInsensitive)) {
				file.noWrite = true
				originalFile.addError(i18n`Cannot write files outside the outDir '${this.logger.formatPath(this.outDir)}': '${this.logger.formatPath(file.path)}'`)
			}
		}
		// 检查路径冲突
		const key = this.relativePath(file.path)
		const exists = this.emittedFiles.get(key)
		if (exists) {
			if (exists === file) {
				return
			}
			// 同一个文件构建时会生成不同的文件对象
			if (exists.originalFile !== file.originalFile) {
				file.noWrite = true
				originalFile.addError(i18n`Output path conflicts with '${this.logger.formatPath(exists.originalPath)}': '${this.logger.formatPath(file.path)}'`)
				// 互相引用，如果任一个文件删除，则重新生成文件
				exists.addDependency({ file, watch: "reloadOnDelete" })
				file.addDependency({ file: exists, watch: "reloadOnDelete" })
				return
			}
		}
		// 添加文件
		this.emittedFiles.set(key, file)
	}

	/** 获取所有自定义扩展名（含点）到 MIME 类型的映射表 */
	readonly mimeTypes: { [ext: string]: string }

	/**
	 * 获取指定文件名对应的 MIME 类型
	 * @param path 要获取的文件名
	 * @param mimeTypes 所有扩展名（含点）到 MIME 类型的映射表
	 */
	getMimeType(path: string) {
		return getMimeType(path, this.mimeTypes) || "application/octet-stream"
	}

	/**
	 * 获取指定 MIME 类型对应的扩展名
	 * @param mimeType 要获取的类型
	 * @param mimeTypes 所有扩展名（含点）到 MIME 类型的映射表
	 */
	getExtByMimeType(mimeType: string) {
		return getExtByMimeType(mimeType, this.mimeTypes)
	}

	// #endregion

	// #region 保存文件

	/**
	 * 保存指定的文件
	 * @param file 要保存的文件
	 */
	async writeFile(file: VFile) {
		// 保存兄弟文件
		if (file.siblings) {
			for (const sibling of file.siblings) {
				await this.writeFile(sibling)
			}
		}
		// 允许插件跳过保存当前文件
		if (file.noWrite) {
			return
		}
		// 保存文件
		const path = this.getOutputPath(file.path)
		if (file.data !== undefined) {
			const writingTask = this.logger.begin(i18n`Writing`, this.logger.formatPath(file.path))
			try {
				await this.fs.writeFile(path, typeof file.data === "string" || file.data instanceof Buffer ? file.data : file.data.toString())
			} catch (e) {
				file.addError({
					message: `Cannot write file: ${e.message}`,
					error: e
				})
			} finally {
				this.logger.end(writingTask)
			}
		} else if (!pathEquals(file.originalPath, path, this.fs.isCaseInsensitive)) {
			const copyingTask = this.logger.begin(i18n`Copying`, this.logger.formatPath(file.path))
			try {
				await this.fs.copyFile(file.originalPath, path)
			} catch (e) {
				file.addError({
					message: `Cannot copy file: ${e.message}`,
					error: e
				})
			} finally {
				this.logger.end(copyingTask)
			}
		}
		await this.emit("writeFile", file)
		await this.reportLogs(file)
	}

	/** 获取生成的目标文件夹绝对路径 */
	readonly outDir: string

	/**
	 * 计算一个绝对路径的最终输出绝对路径
	 * @param path 要计算的绝对路径
	 */
	getOutputPath(path: string) {
		return setDir(path, this.outDir, this.rootDir)
	}

	// #endregion

	// #region 错误和警告

	/** 判断是否在出现第一个错误后终止构建 */
	readonly bail: boolean

	/** 所有存在错误或警告的文件 */
	readonly filesWithLog = new Set<VFile>()

	/**
	 * 报告指定文件的错误和警告
	 * @param file 要处理的文件
	 * @param context 当前的上下文
	 */
	async reportLogs(file: VFile, context = this.context) {
		let hasNewLogs = false
		if (file.logs) {
			while (file.reportedLogCount < file.logs.length) {
				hasNewLogs = true
				const log = file.logs[file.reportedLogCount++]
				if (context) {
					if (log.level === LogLevel.error) {
						context.errorCount++
					} else if (log.level === LogLevel.warning) {
						context.warningCount++
					}
				}
				if (log.line != undefined && log.content == undefined && log.fileName != undefined && this.logger.codeFrame && log.codeFrame == undefined) {
					try {
						log.content = await this.fs.readFile(log.fileName, this.encoding)
					} catch (e) {
						this.logger.debug(e)
					}
				}
				if (log.originalLocation) {
					log.detail = log.detail ? log.detail + "\n" : ""
					log.detail += i18n`    at ${this.logger.formatPath(file.originalPath)}`
					if (log.originalLocation.line !== undefined) {
						log.detail += "(" + (log.originalLocation.line + 1)
						if (log.originalLocation.column !== undefined) {
							log.detail += "," + (log.originalLocation.column + 1)
							if (this.logger.logLevel === LogLevel.debug && log.originalLocation.endLine !== undefined) {
								log.detail += "-" + (log.originalLocation.endLine + 1)
								if (log.originalLocation.endColumn !== undefined) {
									log.detail += "," + (log.originalLocation.endColumn + 1)
								}
							}
						}
						log.detail += ")"
					}
				}
				if (log.fileName !== file.originalPath && (!log.originalLocation || log.originalLocation.fileName !== file.originalPath)) {
					log.detail = log.detail ? log.detail + "\n" : ""
					log.detail += i18n`    at ${this.logger.formatPath(file.originalPath)}`
				}
				await this.emit("buildLog", log, file)
				if (this.bail && log.level === LogLevel.error) {
					throw new Error(i18n`Error found in '${log.fileName}': ${log.message}`)
				}
				this.logger.write(log, log.level !== undefined ? log.level : LogLevel.error)
			}
		}
		if (hasNewLogs) {
			this.filesWithLog.add(file)
		}
	}

	// #endregion

	// #region 安装文件

	/** 判断是否自动安装包 */
	readonly autoInstall: boolean

	/**
	 * 载入一个本地文件
	 * @param name 要载入的文件
	 * @param autoInstall 是否自动安装文件
	 */
	async require(name: string, autoInstall = this.autoInstall) {
		return require(await this.requireResolve(name, autoInstall))
	}

	/**
	 * 解析本地文件对应的路径
	 * @param name 要载入的文件
	 * @param autoInstall 是否自动安装文件
	 */
	async requireResolve(name: string, autoInstall = this.autoInstall) {
		return await resolve(name, this.baseDir, autoInstall ? this.installCommand : undefined, this.logger)
	}

	/** 获取用于安装文件的命令，其中 `<file>` 会被替换为实际的文件名 */
	readonly installCommand: string

	/**
	 * 安装一个包
	 * @param name 要安装的包名
	 * @returns 如果安装成功则返回 `true`，否则说明文件路径错误或安装命令退出状态码非 0，返回 `false`
	 */
	installPackage(name: string) {
		return installPackage(name, this.baseDir, this.installCommand, this.logger)
	}

	// #endregion

	// #region 报告

	/**
	 * 构建完成后的报告器
	 * @param context 构建的上下文
	 * @param builder 当前的构建器对象
	 */
	readonly reporter?: (context: BuildContext, builder: Builder) => void

	/**
	 * 概述报告器
	 * @param context 构建的上下文
	 * @param builder 当前的构建器对象
	 */
	summaryReporter(context: BuildContext, builder: Builder) {
		const log = i18n`${context.errorCount ? color(i18n`Build completed!`, ANSIColor.brightRed) : context.warningCount ? color(i18n`Build completed!`, ANSIColor.brightYellow) : color(i18n`Build success!`, ANSIColor.brightGreen)} (${builder.logger.errorIcon}${color(context.errorCount.toString(), context.errorCount > 0 ? ANSIColor.brightRed : ANSIColor.brightBlack)}  ${builder.logger.warningIcon}${color(context.warningCount.toString(), context.warningCount > 0 ? ANSIColor.brightYellow : ANSIColor.brightBlack)}  ${i18n`Σ `}${context.files.length}  ${i18n`⏱ `}${context.elapsedTime[0] > 60 ? color(context.elapsedTimeString, ANSIColor.brightYellow) : context.elapsedTimeString})`
		// ⌚
		if (context.errorCount) {
			builder.logger.fatal(log)
		} else {
			builder.logger.success(log)
		}
	}

	/**
	 * 详情报告器
	 * @param result 包含构建结果的对象
	 * @param builder 当前的构建器对象
	 */
	detailReporter(result: BuildContext, builder: Builder) {
		// TODO
	}

	// #endregion

}

/** 表示一个已解析的处理器规则 */
export interface ResolvedProcessorRule<T = any> {
	/** 当前处理器的名字 */
	name?: string
	/** 需要处理的文件路径的匹配器 */
	matcher?: Matcher
	/** 处理器实例 */
	processor?: Processor<T>
	/** 处理器源路径 */
	use?: string
	/** 传递给处理器的附加选项 */
	options?: T
	/**
	 * 获取当前处理器输出的路径
	 * @param file 要重命名的文件
	 * @param builder 当前的构建器对象
	 */
	outPath?: (file: VFile, builder: Builder) => string
	/** 当匹配此处理器规则后的下一个处理器 */
	nextTrue?: ResolvedProcessorRule
	/** 当不匹配此处理器规则后的下一个处理器 */
	nextFalse?: ResolvedProcessorRule
}

/** 表示构建的模式 */
export const enum BuildMode {
	/** 全量构建 */
	full,
	/** 增量构建 */
	incremental,
	/** 只计算路径 */
	pathOnly,
}

/** 表示一个构建上下文 */
export class BuildContext {

	/** 获取本次的构建模式 */
	readonly buildMode: BuildMode

	/**
	 * 初始化新的上下文
	 * @param buildMode 构建模式
	 */
	constructor(buildMode: BuildMode) {
		this.buildMode = buildMode
	}

	/** 获取本次构建的开始时间 */
	startTime = process.hrtime()

	/** 获取构建所经过的时间 */
	get elapsedTime() { return process.hrtime(this.startTime) }

	/** 获取构建所经过的时间（字符串形式） */
	get elapsedTimeString() { return formatHRTime(this.elapsedTime) }

	/** 获取本次构建要处理的总任务数 */
	totalTaskCount = 0

	/** 获取本次构建已处理的任务数 */
	doneTaskCount = 0

	/** 获取当前的进度（0-100） */
	get progress() { return this.totalTaskCount === 0 ? 0 : Math.floor(this.doneTaskCount * 100 / this.totalTaskCount) }

	/** 获取本次构建的所有文件 */
	readonly files: VFile[] = []

	/** 判断本次构建是否被中断 */
	aborted = false

	/** 获取本次构建累积错误的个数 */
	errorCount = 0

	/** 获取本次构建累积警告的个数 */
	warningCount = 0

	/** 本次构建的哈希值 */
	private _hash?: string

	/** 获取本次构建的哈希值 */
	get hash() { return this._hash || (this._hash = new VFile("", true).hash) }

}