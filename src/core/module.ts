import { isAbsolute, normalize } from "path"
import { formatCodeFrame } from "../utils/ansi"
import { indexToLineColumn, LineColumn } from "../utils/lineColumn"
import { LogEntry, LogLevel } from "../utils/logger"
import { match, Pattern } from "../utils/matcher"
import { appendName, getDir, getExt, getName, joinPath, prependName, relativePath, setDir, setExt, setName } from "../utils/path"
import { SourceMapBuilder, SourceMapData, SourceMapObject, toSourceMapBuilder, toSourceMapObject, toSourceMapString } from "../utils/sourceMap"
import { replace, splice } from "../utils/textDocument"
import { SourceMapTextWriter } from "../utils/textWriter"
import { Bundler } from "./bundler"
import { UpdateType } from "./watcher"

/** 表示一个模块 */
export class Module {

	// #region 核心

	/** 获取当前模块的原始路径 */
	readonly originalPath: string

	/** 判断当前模块是否是入口模块 */
	readonly isEntryModule: boolean

	/**
	 * 初始化新的模块
	 * @param originalPath 模块的原始路径
	 * @param isEntryModule 是否是入口模块
	 */
	constructor(originalPath: string, isEntryModule: boolean) {
		this.path = this.originalPath = originalPath
		this.isEntryModule = isEntryModule
	}

	/** 获取当前模块的状态 */
	state = ModuleState.initial

	/** 获取正在执行的处理器名称 */
	processorName?: string

	/**
	 * 获取正在执行的确认对象
	 * @internal
	 */
	promise?: Promise<void>

	/** 全局唯一哈希值计数器 */
	private static _hashSeed = 0

	/** 模块的哈希值 */
	private _hash?: string

	/** 获取或设置模块的哈希值，每次重新构建后哈希值都会发生变化 */
	get hash() { return this._hash || (this._hash = (Module._hashSeed++).toString(36) + Date.now().toString(36)) }
	set hash(value) { this._hash = value }

	/** 获取当前模块被更新的类型 */
	updateType?: UpdateType

	/** 获取或设置当前模块的 MIME 类型 */
	type?: string

	/** 获取或设置当前模块关联的模块打包器 */
	bundler?: Bundler | false

	/** 判断或设置是否跳过保存当前模块 */
	noWrite?: boolean

	/** 判断或设置是否禁止缓存当前模块 */
	noCache?: boolean

	/**
	 * 重置模块
	 * @param state 重置后的模块状态
	 */
	reset(state: ModuleState) {
		this.state = state
		this.path = this.originalPath
		this.logs = this._sourceMapData = this.sourceMap = this.data = this.noCache = this.noWrite = this.bundler = this.type = this._hash = undefined
		if (this.dependencies) this.dependencies.length = 0
		if (this.generatedModules) this.generatedModules.length = 0
		if (this.props) this.props.clear()
	}

	/** 创建当前模块对象的副本 */
	clone() {
		const module = Object.assign(new Module(this.originalPath, this.isEntryModule), this) as Module
		module._hash = module.promise = undefined
		if (this.logs) module.logs = this.logs.slice(0)
		if (this.dependencies) module.dependencies = this.dependencies.slice(0)
		if (this.generatedModules) module.generatedModules = this.generatedModules.slice(0)
		if (this.props) module.props = new Map(this.props.entries())
		return module
	}

	// #endregion

	// #region 路径

	/** 获取或设置模块的最终路径 */
	path: string

	/** 获取或设置模块的最终文件夹路径 */
	get dir() { return getDir(this.path) }
	set dir(value) { this.path = setDir(this.path, value) }

	/** 获取或设置模块的最终文件名（不含扩展名部分） */
	get name() { return getName(this.path, false) }
	set name(value) { this.path = setName(this.path, value, false) }

	/** 获取或设置模块的最终扩展名（含点） */
	get ext() { return getExt(this.path) }
	set ext(value) { this.path = setExt(this.path, value) }

	/**
	 * 为模块的最终文件名添加前缀
	 * @param value 要追加的内容
	 */
	prependName(value: string) { this.path = prependName(this.path, value) }

	/**
	 * 为模块的最终文件名（不含扩展名部分）添加后缀
	 * @param value 要追加的内容
	 */
	appendName(value: string) { this.path = appendName(this.path, value) }

	/**
	 * 测试模块的最终路径是否匹配指定的模式
 	 * @param pattern 要测试的匹配模式，可以是通配符或正则表达式
	 */
	match(pattern: Pattern) { return match(this.path, pattern, isAbsolute(this.path) ? process.cwd() : undefined, false) }

	/**
	 * 测试模块的原始路径是否匹配指定的模式
 	 * @param pattern 要测试的匹配模式，可以是通配符或正则表达式
	 */
	matchOriginal(pattern: Pattern) { return match(this.originalPath, pattern, isAbsolute(this.path) ? process.cwd() : undefined, false) }

	/**
	 * 获取指定路径基于当前模块原始路径对应的路径
	 * @param path 要处理的路径
	 */
	resolvePath(path: string) { return isAbsolute(path) ? normalize(path) : joinPath(this.originalPath, "..", path) }

	/**
	 * 获取指定路径基于当前模块最终路径的相对路径
	 * @param path 要处理的路径
	 */
	relativePath(path: string) { return relativePath(this.dir, path) }

	// #endregion

	// #region 数据

	/**
	 * 获取或设置模块的最终数据
	 * - 字符串：该模块是文本模块，值是文本内容
	 * - Buffer：该模块是二进制模块，值是二进制数据
	 * - 对象：仅在首次需要时才调用 `generate()` 计算数据
	 */
	data?: string | Buffer | {
		[key: string]: any
		/** 生成模块的数据 */
		generate(module: Module): {
			/** 文本内容或二进制数据 */
			data: string | Buffer
			/** 源映射（Source Map）数据 */
			sourceMap?: SourceMapData
		}
	}

	/** 获取或设置模块的最终二进制数据或文本内容 */
	get bufferOrContent() {
		let data = this.data
		if (typeof data !== "string" && !Buffer.isBuffer(data) && data != undefined) {
			const result = data.generate(this)
			this.data = data = result.data
			this.applySourceMap(result.sourceMap)
		}
		return data as string | Buffer
	}
	set bufferOrContent(value) {
		this.data = value
	}

	/** 获取或设置模块的最终文本内容 */
	get content() {
		let data = this.data
		if (typeof data !== "string") {
			data = this.bufferOrContent
			if (Buffer.isBuffer(data)) {
				this.data = data = data.toString()
			}
		}
		return data as string
	}
	set content(value) {
		this.data = value
	}

	/** 获取或设置模块的最终二进制数据 */
	get buffer() {
		let data = this.data
		if (!Buffer.isBuffer(data)) {
			data = this.bufferOrContent
			if (typeof data === "string") {
				this.data = data = Buffer.from(data)
			}
		}
		return data as Buffer
	}
	set buffer(value) {
		this.data = value
	}

	/** 计算当前模块的字节大小 */
	get size() {
		const data = this.bufferOrContent
		return typeof data === "string" ? Buffer.byteLength(data) : data == undefined ? -1 : data.length
	}

	/** 计算当前模块的 MD5 值 */
	get md5() { return (require("../utils/crypto") as typeof import("../utils/crypto")).md5(this.bufferOrContent || "") }

	/** 计算当前模块的 SHA-1 值 */
	get sha1() { return (require("../utils/crypto") as typeof import("../utils/crypto")).sha1(this.bufferOrContent || "") }

	// #endregion

	// #region 源映射

	/** 判断或设置当前模块是否需要生成源映射（Source Map）*/
	sourceMap?: boolean

	/** 当前模块关联的源映射（Source Map）数据 */
	private _sourceMapData?: SourceMapData | null

	/** 获取或设置当前模块关联的源映射（Source Map）数据 */
	get sourceMapData() {
		// 读取数据，确保已计算对应的源映射
		this.bufferOrContent
		return this._sourceMapData as SourceMapData | undefined | null
	}
	set sourceMapData(value) {
		if (value) {
			let sourceMap: SourceMapObject | SourceMapBuilder
			if (value instanceof SourceMapBuilder) {
				this._sourceMapData = sourceMap = new SourceMapBuilder()
				sourceMap.sourcesContent.push(...value.sourcesContent)
				sourceMap.mappings.push(...value.mappings)
				sourceMap.names.push(...value.names)
			} else {
				value = toSourceMapObject(value)
				this._sourceMapData = sourceMap = {
					version: value.version,
					sources: [],
					mappings: value.mappings,
				}
				if (value.sourcesContent) {
					sourceMap.sourcesContent = value.sourcesContent
				}
				if (value.names) {
					sourceMap.names = value.names
				}
			}
			sourceMap.file = this.originalPath
			if (value.sources) {
				for (let i = 0; i < value.sources.length; i++) {
					sourceMap.sources[i] = this.resolvePath(value.sources[i])
				}
			}
		} else {
			this._sourceMapData = value
			this.sourceMap = false
		}
	}

	/** 获取或设置当前模块关联的源映射（Source Map）对象 */
	get sourceMapObject() { return this.sourceMapData ? this._sourceMapData = toSourceMapObject(this._sourceMapData!) : undefined }
	set sourceMapObject(value) { this.sourceMapData = value }

	/** 获取或设置当前模块关联的源映射（Source Map）构建器 */
	get sourceMapBuilder() { return this.sourceMapData ? this._sourceMapData = toSourceMapBuilder(this._sourceMapData!) : undefined }
	set sourceMapBuilder(value) { this.sourceMapData = value }

	/** 获取或设置当前模块关联的源映射（Source Map）字符串 */
	get sourceMapString(): string | undefined { return toSourceMapString(this.sourceMapData!) }
	set sourceMapString(value) { this.sourceMapData = value }

	/**
	 * 合并指定的新源映射（Source Map）
	 * @param sourceMap 要合并的新源映射
	 * @description
	 * 如果是第一次生成源映射，则本方法会直接保存源映射
	 * 如果基于当前模块内容生成了新模块内容，则本方法会将原有的源映射和新生成的源映射合并保存
	 */
	applySourceMap(sourceMap: SourceMapData | null | undefined) {
		const oldMap = this.sourceMapBuilder
		this.sourceMapData = sourceMap
		if (oldMap) {
			const newMap = this.sourceMapBuilder
			if (newMap) {
				newMap.applySourceMap(oldMap)
			}
		}
	}

	// #endregion

	// #region 日志

	/** 获取当前模块相关的所有日志 */
	logs?: ModuleLogEntry[]

	/**
	 * 添加一个日志
	 * @param log 要格式化的日志
	 * @param level 日志的等级
	 * @returns 返回日志对象
	 */
	protected addLog(log: string | Error | Partial<ModuleLogEntry>, level = LogLevel.log) {
		if (typeof log === "string") {
			log = { source: this.processorName, level, message: log }
		} else if (log instanceof Error) {
			log = { source: this.processorName, level, ...log, message: log.message, stack: log.stack }
		} else {
			log = { source: this.processorName, level, ...log }
		}
		log.fileName = log.fileName == undefined ? this.originalPath : this.resolvePath(log.fileName)
		if (log.fileName === this.originalPath) {
			// 如果用户只提供了索引但未提供行号，则根据当前模块内容计算
			if (log.index != undefined && log.line == undefined && this.data != undefined) {
				const loc = indexToLineColumn(this.content, log.index)
				log.line = loc.line
				log.column = loc.column
				if (log.endIndex != undefined && log.endLine == undefined) {
					const endLoc = indexToLineColumn(this.content, log.endIndex)
					log.endLine = endLoc.line
					log.endColumn = endLoc.column
				}
			}
			if (log.line != undefined) {
				// 计算原位置
				if (log.computeOriginalLocation !== false) {
					// 如果存在源映射，自动计算原始位置
					if (this.sourceMapBuilder) {
						const source = this.sourceMapBuilder.getSource(log.line, log.column || 0, true, true)
						if (source && source.sourcePath != undefined) {
							log.fileName = source.sourcePath
							log.line = source.line
							log.column = source.column
							if (log.endLine != undefined) {
								const endSource = this.sourceMapBuilder.getSource(log.endLine, log.endColumn || 0, true, true)
								if (endSource && source.sourcePath === endSource.sourcePath) {
									log.endLine = endSource.line
									log.endColumn = endSource.column
								} else {
									log.endLine = log.endColumn = undefined
								}
							}
						}
					}
					// 如果当前模块存在父模块，则计算为父模块的位置
					if (this.parentLine != undefined && log.fileName === this.originalPath) {
						log.fileName = this.originalPath.replace(/\|[^\|]*$/, "")
						if (log.line) {
							log.line += this.parentLine
						} else if (log.column != undefined) {
							log.line = this.parentLine
							log.column += this.parentColumn!
						}
						if (log.endLine != undefined) {
							if (log.endLine) {
								log.endLine += this.parentLine
							} else if (log.endColumn != undefined) {
								log.endLine = this.parentLine
								log.endColumn += this.parentColumn!
							}
						}
					}
				}
				// 计算代码片段
				if (log.codeFrame === undefined && this.data != undefined && log.fileName === this.originalPath) {
					log.codeFrame = formatCodeFrame(this.content, log.line, log.column, log.endLine, log.endColumn)
				}
			}
		} else {
			log.stack = `    at ${this.originalPath}` + (log.stack ? "\n" + log.stack : "")
		}
		const logs = this.logs || (this.logs = [])
		logs.push(log as ModuleLogEntry)
		return log as ModuleLogEntry
	}

	/** 判断当前模块是否包含错误 */
	get hasErrors() { return this.logs ? this.logs.some(log => log.level === LogLevel.error) : false }

	/**
	 * 添加一个错误
	 * @param log 错误的内容
	 */
	addError(log: string | Error | Partial<ModuleLogEntry>) {
		return this.addLog(log, LogLevel.error)
	}

	/** 判断当前模块是否包含警告 */
	get hasWarnings() { return this.logs ? this.logs.some(log => log.level === LogLevel.warning) : false }

	/**
	 * 添加一个警告
	 * @param log 警告的内容
	 */
	addWarning(log: string | Error | Partial<ModuleLogEntry>) {
		return this.addLog(log, LogLevel.warning)
	}

	// #endregion

	// #region 依赖

	/** 获取当前模块的所有依赖 */
	dependencies?: ModuleDependency[]

	/**
	 * 添加一个依赖，当依赖的模块更新后当前模块需重新构建
	 * @param dependency 依赖的模块，如果是字符串，则表示相对于当前模块的外部依赖的路径
	 */
	addDependency(dependency: string | Partial<ModuleDependency>) {
		if (typeof dependency === "string") {
			dependency = { source: this.processorName, type: ModuleDependencyType.external, path: dependency }
		} else {
			dependency = { source: this.processorName, type: ModuleDependencyType.external, ...dependency }
		}
		const dependencies = this.dependencies || (this.dependencies = [])
		dependencies.push(dependency as ModuleDependency)
		return dependency as ModuleDependency
	}

	// #endregion

	// #region 更新

	/**
	 * 更新模块的数据
	 * @param data 要更新的模块数据
	 * @param sourceMap 要合并的源映射（Source Map）
	 * @param logs 要报告的日志
	 * @param dependencies 要添加的依赖
	 */
	update(data: Module["data"], sourceMap?: Module["sourceMapData"], logs?: readonly (string | Error | ModuleLogEntry)[], dependencies?: (string | ModuleDependency)[]) {
		if (logs) {
			for (const log of logs) {
				this.addError(log)
			}
		}
		if (dependencies) {
			for (const dependency of dependencies) {
				this.addDependency(dependency)
			}
		}
		this.applySourceMap(sourceMap)
		this.data = data
	}

	/**
	 * 增删当前模块的内容并更新源映射
	 * @param index 增删的索引（从 0 开始）
	 * @param deleteCount 要删除的数目
	 * @param insert 要插入的字符串内容
	 */
	splice(index: number, deleteCount: number, insert: any) {
		if (this.sourceMap) {
			const data = {
				content: this.content,
				path: this.originalPath,
				sourceMap: this.sourceMapData
			}
			const newData = splice(data, index, deleteCount, insert)
			if (newData !== data) {
				this.content = newData.content
				this.sourceMapData = (newData as SourceMapTextWriter).sourceMapBuilder
			}
		} else {
			this.content = `${this.content.substring(0, index)}${insert}${this.content.substring(index + deleteCount)}`
		}
	}

	/**
	 * 替换当前模块的内容并更新源映射
	 * @param search 要搜索的内容
	 * @param replacement 要替换的内容
	 */
	replace(search: string | RegExp, replacement: any | ((source: string, ...args: any[]) => string)) {
		if (this.sourceMap) {
			const data = {
				content: this.content,
				path: this.originalPath,
				sourceMap: this.sourceMapData
			}
			const newData = replace(data, search, replacement)
			if (newData !== data) {
				this.content = newData.content
				this.sourceMapData = (newData as SourceMapTextWriter).sourceMapBuilder
			}
		} else {
			this.content = this.content.replace(search, replacement)
		}
	}

	// #endregion

	// #region 自定义属性

	/** 获取所有自定义属性 */
	props?: Map<any, any>

	/**
	 * 获取指定的自定义属性
	 * @param key 属性名
	 */
	getProp(key: any) { return this.props && this.props.get(key) }

	/**
	 * 设置指定的自定义属性
	 * @param key 属性名
	 * @param value 属性值
	 */
	setProp(key: any, value: any) { (this.props || (this.props = new Map())).set(key, value) }

	/**
	 * 删除指定的自定义属性
	 * @param key 属性名
	 * @returns 如果已成功删除属性则返回 `true`，否则说明属性不存在，返回 `false`
	 */
	deleteProp(key: any) { return this.props ? this.props.delete(key) : false }

	// #endregion

	// #region 生成模块

	/** 如果当前模块是生成的，则获取生成当前模块的源模块 */
	originalModule?: Module

	/** 获取当前模块生成的所有模块 */
	generatedModules?: GeneratedModule[]

	/**
	 * 添加当前模块生成的新模块
	 * @param path 要添加的模块路径（相对于当前模块路径）
	 * @param data 要添加的模块数据
	 */
	addGenerated(path: Module["path"], data: Module["data"]) {
		const generatedModule = Object.create(this) as Module
		generatedModule.generatedModules = generatedModule.props = generatedModule.dependencies = generatedModule.logs = undefined
		generatedModule.originalModule = this.originalModule || this
		generatedModule.path = this.resolvePath(path)
		generatedModule.data = data
		this.generatedModules = this.generatedModules || []
		this.generatedModules.unshift(generatedModule)
		return generatedModule as GeneratedModule
	}

	// #endregion

	// #region 子模块

	/** 如果当前模块是其它模块的一部分，则获取当前模块在所在模块的行号 */
	parentLine?: number

	/** 如果当前模块是其它模块的一部分，则获取当前模块在所在模块的列号 */
	parentColumn?: number

	/**
	 * 由当前模块截取其中一部分创建新的子模块
	 * @param name 子模块的文件名，文件名不能包含 `|`
	 * @param data 子模块的原始路据
	 * @param index 子模块在当前模块数据的索引（从 0 开始）
	 */
	createSubmodule(name: string, data = this.bufferOrContent, index?: number) {
		console.assert(!name.includes("|"), "Name of submodule cannot contain '|'")
		let path = this.originalPath
		let loc: LineColumn | undefined
		if (index != undefined && this.content != undefined) {
			loc = indexToLineColumn(this.content, index)
			// 如果存在源映射，则计算原始位置
			if (this.sourceMapBuilder) {
				const source = this.sourceMapBuilder.getSource(loc.line, loc.column, true, true)
				if (source && source.sourcePath) {
					path = source.sourcePath
					loc.line = source.line!
					loc.column = source.column!
				}
			}
			// 如果当前文件本身是其它文件的一部分，叠加偏移
			if (this.parentLine != undefined && path === this.originalPath) {
				path = path.replace(/\|[^\|]*$/, "")
				if (loc.line) {
					loc.line += this.parentLine
				} else {
					loc.line = this.parentLine
					loc.column += this.parentColumn!
				}
			}
		}
		const module = new Module(`${path}|${name}`, false)
		if (loc) {
			module.parentLine = loc.line
			module.parentColumn = loc.column
		}
		module.data = data
		return module
	}

	// #endregion

}

/** 表示模块的状态 */
export const enum ModuleState {
	/** 初始状态 */
	initial = 1 << 0,
	/** 正在加载模块 */
	loading = 1 << 1,
	/** 模块已加载 */
	loaded = 1 << 1 | 1,
	/** 正在生成模块 */
	emitting = 1 << 2,
	/** 模块已生成 */
	emitted = 1 << 2 | 1,
	/** 模块已被删除 */
	deleted = 1 << 3 | 1,
}

/** 表示一个模块日志项 */
export interface ModuleLogEntry extends LogEntry {
	/** 日志的等级 */
	level: LogLevel
	/** 是否允许计算构建前的源位置 */
	computeOriginalLocation?: boolean
	/** 日志相关的源索引（从 0 开始）*/
	index?: number
	/** 日志相关的源结束索引（从 0 开始）*/
	endIndex?: number
}

/** 表示一个模块依赖项 */
export interface ModuleDependency {
	[key: string]: any
	/** 依赖的来源 */
	source?: string
	/** 依赖的类型 */
	type: ModuleDependencyType
	/** 依赖的地址 */
	url?: string
	/** 依赖在源文件的索引（从 0 开始）*/
	index?: number
	/** 依赖在源文件的结束索引（从 0 开始）*/
	endIndex?: number
	/** 依赖地址对应的本地绝对路径 */
	path?: string
	/** 依赖的模块对象 */
	module?: Module
	/** 依赖解析失败的详情 */
	detail?: string
	/** 是否需要内联本次依赖 */
	inline?: boolean
	/** 判断本次依赖是否是循环依赖 */
	circular?: boolean
}

/** 表示模块依赖的类型 */
export const enum ModuleDependencyType {
	/** 外部依赖，构建当前模块需要用到依赖的目标 */
	external = 1 << 0,
	/** 外部依赖列表，构建当前模块需要用到依赖的目标，依赖的目标是一个由通配符匹配的所有文件 */
	externalList = 1 << 1,
	/** 动态引用，执行当前模块时，可能需要动态引用依赖 */
	reference = 1 << 2,
	/** 静态导入，必须先导入依赖才能执行当前模块 */
	staticImport = 1 << 3,
	/** 动态导入，执行当前模块时，可能需要动态导入依赖 */
	dynamicImport = 1 << 4,
}

/** 表示一个最终生成的模块 */
export type GeneratedModule = Pick<Module, "originalModule" | "path" | "bufferOrContent" | "buffer" | "content" | "size" | "hash" | "md5" | "sha1" | "type" | "noWrite" | "noCache" | "logs" | "hasErrors" | "hasWarnings" | "generatedModules">