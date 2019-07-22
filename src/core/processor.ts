import { join } from "path"
import { Matcher, Pattern } from "../utils/matcher"
import { isStructuredCloneable, WorkerContext, WorkerPool } from "../utils/workerPool"
import { Builder } from "./builder"
import { i18n } from "./i18n"
import { Module } from "./module"

/** 表示一个处理器执行器 */
export class ProcessorRunner {

	/** 获取当前的构建器对象*/
	readonly builder: Builder

	/** 获取处理器链表的根节点 */
	readonly processorRoot?: ResolvedProcessorRule

	/** 获取运行处理器使用的线程池，如果不使用多线程则为 `undefined` */
	readonly workerPool?: WorkerPool

	/**
	 * 初始新的处理器执行器
	 * @param builder 当前的构建器对象
	 * @param rules 所有处理器规则
	 * @param name 处理器规则的名称
	 * @param workerPool 运行处理器使用的线程池，如果不使用多线程则为 `undefined`
	 */
	constructor(builder: Builder, rules: (ProcessorRule | false | null | undefined)[], name: string, workerPool?: WorkerPool) {
		this.builder = builder
		this.workerPool = workerPool
		this.processorRoot = this.resolveProcessorRules(rules, name)
	}

	/**
	 * 解析所有处理器规则
	 * @param rules 所有处理器规则
	 * @param name 处理器规则的名称
	 * @param breakTarget 中断后执行的处理器规则
	 */
	protected resolveProcessorRules(rules: (ProcessorRule | false | null | undefined)[], name: string, breakTarget?: ResolvedProcessorRule) {
		let last = breakTarget
		for (let i = rules.length - 1; i >= 0; i--) {
			const rule = rules[i]
			// 允许用户通过编写 [条件 ? 处理器 : null] 实现在特定条件忽略指定处理器
			if (!rule) {
				continue
			}
			const id = `${name}[${i}]`
			const resolved: ResolvedProcessorRule = {}
			if (rule.match != undefined || rule.exclude != undefined) {
				resolved.matcher = this.builder.createMatcher(rule.match || (() => true), rule.exclude)
			}
			let nextTrue = rule.break ? breakTarget : last
			if (typeof rule.process === "function") {
				resolved.processor = rule as Processor
				resolved.options = rule.options !== undefined ? rule.options : {}
				resolved.name = rule.name || id
				resolved.parallel = false
			} else if (typeof rule.use === "string") {
				// 延时到首次需要时载入处理器
				resolved.processor = rule.use
				resolved.options = rule.options !== undefined ? rule.options : {}
				resolved.name = rule.name
				resolved.parallel = rule.parallel
			} else if (Array.isArray(rule.use)) {
				resolved.name = rule.name || id
				resolved.parallel = false
				nextTrue = this.resolveProcessorRules(rule.use, id, nextTrue)
			} else if (rule.use != undefined) {
				resolved.processor = new rule.use(resolved.options = rule.options !== undefined ? rule.options : {}, this.builder)
				resolved.name = rule.name || rule.use.name || id
				resolved.parallel = false
			} else {
				resolved.name = rule.name || id
				resolved.parallel = false
			}
			if (rule.outPath != undefined) {
				resolved.outPath = typeof rule.outPath === "string" ? (module, builder) => builder.formatPath(rule.outPath as string, module, resolved.matcher && resolved.matcher.base || undefined) : rule.outPath
			}
			resolved.nextTrue = nextTrue
			resolved.nextFalse = last
			last = resolved
		}
		return last
	}

	/**
	 * 处理指定的模块
	 * @param module 要处理的模块
	 */
	async process(module: Module) {
		const path = module.path
		try {
			for (let processorRule = this.processorRoot; processorRule;) {
				// 跳过不匹配的处理器
				if (processorRule.matcher && !processorRule.matcher.test(path, module, this)) {
					processorRule = processorRule.nextFalse
					continue
				}
				module.processorName = processorRule.name
				// 处理模块
				if (processorRule.processor) {
					// 为了加速启动，处理器只会在第一次需要时才会被加载
					if (typeof processorRule.processor === "string") {
						// 解析处理器绝对路径，如果不存在则自动安装
						const processorPath = await this.builder.resolvePackage(processorRule.processor, true)
						// 确保处理器只加载一次
						if (typeof processorRule.processor === "string") {
							if (processorPath) {
								try {
									// 加载处理器模块
									let factory = require(processorPath) as ProcessorFactory | { __esModule: true, default: ProcessorFactory }
									// 支持 ES6 导出模块
									if (typeof factory === "object" && factory && factory.__esModule && "default" in factory) {
										factory = factory.default
									}
									if (typeof factory !== "function") {
										throw new Error(i18n`'${processorPath}': 'module.exports' is not a class`)
									}
									if (processorRule.name == undefined) {
										module.processorName = processorRule.name = factory.name || processorRule.processor
									}
									// 只有满足以下条件才启用多线程：
									// 1. 系统支持多线程；
									// 2. 插件支持多线程；
									// 3. 插件的选项可以在线程之间传递（主要指没有函数）
									// 4. 用户未禁用多线程
									if (processorRule.parallel = processorRule.parallel !== false && factory.parallel && this.workerPool && isStructuredCloneable(processorRule.options)) {
										// 创建多线程代理
										processorRule.processor = {
											read: true,
											process: async (module: Module, options: any) => {
												const data = module.bufferOrContent
												const result = await this.workerPool!.exec({
													processorPath,
													options,
													module: {
														originalPath: module.originalPath,
														path: module.path,
														data: data,
														sourceMap: module.sourceMap,
														_sourceMapData: module.sourceMapData,
														processorName: module.processorName,
													}
												}, Buffer.isBuffer(data) ? [data.buffer] : undefined)
												module.path = result.path
												module.data = result.data
												module.sourceMap = result.sourceMap
												if (result._sourceMapData) {
													// @ts-ignore
													module._sourceMapData = result._sourceMapData
												}
												if (result.logs) {
													module.logs = module.logs || []
													module.logs.push(...result.logs)
												}
												if (result.dependencies) {
													module.dependencies = module.dependencies || []
													module.dependencies.push(...result.dependencies)
												}
												if (result.props) {
													for (const [key, value] of result.props.entries()) {
														module.setProp(key, value)
													}
												}
											}
										}
									} else {
										processorRule.processor = new factory(processorRule.options, this.builder)
									}
								} catch (e) {
									if (processorRule.name == undefined) {
										module.processorName = processorRule.name = processorRule.processor as string
									}
									processorRule.processor = {
										read: false,
										process(module, options, builder) {
											module.addError({
												message: i18n`Skipped, cannot load module '${builder.logger.formatPath(processorPath)}': ${e.message || e}`,
												error: e
											})
										}
									}
									module.addError({
										message: i18n`Skipped, cannot load module '${this.builder.logger.formatPath(processorPath)}': ${e.message || e}`,
										stack: e.stack,
										error: e
									})
									break
								}
							} else {
								const processorPath = processorRule.processor
								if (processorRule.name == undefined) {
									module.processorName = processorRule.name = processorPath as string
								}
								processorRule.processor = {
									read: false,
									process(module) {
										module.addError(i18n`Skipped, cannot find module '${processorPath}'`)
									}
								}
							}
						} else {
							module.processorName = processorRule.name
						}
					}
					// 读取模块内容
					if (module.data === undefined && processorRule.processor.read !== false) {
						if (!await this.builder.readModule(module, processorRule.processor.read === "text", processorRule.name!)) {
							break
						}
					}
					const processingTask = this.builder.logger.begin(processorRule.name!, this.builder.logger.formatPath(module.originalPath))
					try {
						await processorRule.processor.process(module, processorRule.options, this.builder)
					} catch (e) {
						debugger
						module.addError(e)
						break
					} finally {
						this.builder.logger.end(processingTask)
					}
					if (module.hasErrors) {
						break
					}
				}
				// 计算输出路径
				if (processorRule.outPath) {
					try {
						module.path = this.builder.resolvePath(processorRule.outPath(module, this.builder))
					} catch (e) {
						module.addError(e)
						break
					}
				}
				processorRule = processorRule.nextTrue
			}
		} finally {
			module.processorName = undefined
		}
	}

	/**
	 * 创建一个用于执行处理器的线程池
	 * @param builder 当前的构建器对象
	 * @param size 线程池的大小，如果为 0 表示不启用多线程
	 * @returns 返回线程池，如果 size < 2 则返回 `undefined`
	 */
	static createWorkerPool(builder: Builder, size = Math.ceil(require("os").cpus().length / 2)) {
		if (size < 2) {
			return
		}
		return new WorkerPool(async (data: any, context: WorkerContext) => {
			// 初始化上下文
			let processors = context.processors
			if (!processors) {
				context.processors = processors = new Map<string, any>()
				context.Module = require(context.workerData.modulePath).Module
				context.Builder = require(context.workerData.builderPath).Builder
				context.builder = Object.setPrototypeOf({
					...context.workerData.builder,
					resolvePackage(name: string, devDependency?: boolean) {
						return context.call("resolvePackage", { name, devDependency })
					},
					installPackage(name: string, devDependency?: boolean) {
						return context.call("installPackage", { name, devDependency })
					}
				}, context.Builder!.prototype)
				process.on("unhandledRejection", (error) => {
					console.error(error)
					process.exit(-1)
				})
			}
			const { processorPath, options, module } = data
			// 加载处理器模块
			let processor = processors.get(processorPath)
			if (!processor) {
				let factory = require(processorPath) as ProcessorFactory | { __esModule: true, default: ProcessorFactory }
				// 支持 ES6 导出模块
				if (typeof factory === "object" && factory && factory.__esModule && "default" in factory) {
					factory = factory.default
				}
				context.processors!.set(processorPath, processor = new (factory as ProcessorFactory)(options, context.builder!))
			}
			if (typeof module.data !== "string") {
				module.data = Buffer.from(module.data)
			}
			Object.setPrototypeOf(module, context.Module!.prototype)
			await processor.process(module, options, context.builder)
			return module
		}, {
				size: size,
				workerData: {
					modulePath: join(__dirname, "module"),
					builderPath: join(__dirname, "builder"),
					builder: {
						baseDir: builder.baseDir,
						rootDir: builder.rootDir,
						outDir: builder.outDir,
						mimeTypes: builder.mimeTypes,
						sourceMap: builder.sourceMap,
						noPathCheck: builder.noPathCheck,
						bail: builder.bail
					}
				},
				functions: {
					resolvePackage(data) {
						return builder.resolvePackage(data.name, data.devDependency)
					},
					installPackage(data) {
						return builder.resolvePackage(data.name, data.devDependency)
					}
				}
			})
	}

}

/** 表示一个模块处理器 */
export interface Processor<TOptions = any> {
	/**
	 * 在使用当前处理器处理前是否需要读取模块内容
	 * - `"text"`（默认）: 使用全局设置的编码读取文本内容
	 * - `"binary"`/`true`: 读取二进制数据
	 * - `false`: 不读取模块内容
	 */
	read?: boolean | "binary" | "text"
	/**
	 * 负责处理单个模块
	 * @param module 要处理的模块
	 * @param options 传递给处理器的附加选项
	 * @param builder 当前的构建器对象
	 */
	process(module: Module, options: TOptions, builder: Builder): void | Promise<void>
}

/** 表示一个模块处理器规则 */
export interface ProcessorRule<TOptions = any> extends Partial<Processor<TOptions>> {
	/** 当前处理器的友好名称 */
	name?: string
	/** 指定哪些模块可以使用此处理器，可以是通配符或正则表达式等 */
	match?: Pattern
	/** 指定额外排除的模块，可以是通配符或正则表达式等 */
	exclude?: Pattern
	/** 指定使用的处理器，可以是待加载的插件路径或多个处理器规则组合 */
	use?: string | ProcessorFactory<TOptions> | (ProcessorRule | false | undefined | null)[]
	/** 传递给处理器的附加选项 */
	options?: TOptions
	/**
	 * 当前处理器输出的模块路径，如果是字符串，则其中以下标记会被替换：
	 * - `<path>`: 模块的相对路径，等价于 `<dir>/<name><ext>`
	 * - `<dir>`: 模块所在文件夹的相对路径
	 * - `<name>`: 模块的文件名（不含文件夹和扩展名部分）
	 * - `<ext>`: 模块的扩展名（含点）
	 * - `<hash>`: 模块的构建哈希值（小写），默认截取前 8 位，如果要截取前 n 位，使用 `<hash:n>`
	 * - `<md5>`: 模块内容的 MD5 串（小写），默认截取前 8 位，如果要截取前 n 位，使用 `<md5:n>`
	 * - `<sha1>`: 模块内容的 SHA-1 串（小写），默认截取前 8 位，如果要截取前 n 位，使用 `<sha1:n>`
	 * - `<random>`: 随机整数，默认为 8 位，如果要自定义为 n 位，使用如 `<random:n>`
	 * - `<date>`: 当前时间，默认为用户本地可读格式，如果要自定义格式，使用如 `<date:yyyyMMdd>`
	 * - `<version>`: 构建器的版本号
	 * @param module 要重命名的模块
	 * @param builder 当前的构建器对象
	 * @returns 返回相对于根文件夹的相对路径
	 */
	outPath?: string | ((module: Module, builder: Builder) => string)
	/**	是否允许在其它线程执行此处理器 */
	parallel?: boolean
	/** 是否跳过后续同级处理器 */
	break?: boolean
}

/** 表示一个模块处理器构造函数 */
export interface ProcessorFactory<T = any> {
	/**
	 * 初始化新的处理器
	 * @param options 附加选项
	 * @param builder 当前的构建器对象
	 */
	new(options: T, builder: Builder): Processor<T>
	/** 获取当前处理器的友好名称 */
	name: string
	/**	判断是否允许在其它线程执行此处理器 */
	parallel?: boolean
}

/** 表示一个已解析的处理器规则 */
export interface ResolvedProcessorRule<TOptions = any> {
	/** 当前处理器的友好名称 */
	name?: string
	/** 匹配要处理的模块路径的匹配器 */
	matcher?: Matcher
	/** 当前处理器实例 */
	processor?: string | Processor<TOptions>
	/** 传递给处理器的附加选项 */
	options?: TOptions
	/**
	 * 获取当前处理器输出路径的回调函数
	 * @param module 要重命名的模块
	 * @param builder 当前的构建器对象
	 */
	outPath?: (module: Module, builder: Builder) => string
	/** 是否允许在其它线程执行此处理器 */
	parallel?: boolean
	/** 当匹配此处理器规则后的下一个处理器 */
	nextTrue?: ResolvedProcessorRule
	/** 当不匹配此处理器规则后的下一个处理器 */
	nextFalse?: ResolvedProcessorRule
}