import { isAbsolute, normalize } from "path"
import { indexToLineColumn } from "../utils/lineColumn"
import { match, Pattern } from "../utils/matcher"
import { appendName, getDir, getExt, getName, joinPath, prependName, relativePath, setDir, setExt, setName } from "../utils/path"
import { SourceMapBuilder, SourceMapData, SourceMapObject, toSourceMapBuilder, toSourceMapObject, toSourceMapString } from "../utils/sourceMap"
import { replace, splice } from "../utils/textDocument"
import { SourceMapTextWriter } from "../utils/textWriter"
import { LogEntry, LogLevel } from "./logger"
import { Bundler } from "./options"

/** 表示一个虚拟文件 */
export class VFile {

	// #region 核心

	/** 获取当前文件的原始路径 */
	readonly originalPath: string

	/** 判断当前文件是否是外部文件 */
	readonly isExternal: boolean

	/**
	 * 初始化新的文件
	 * @param originalPath 文件的原始路径
	 * @param isExternal 是否是外部文件
	 */
	constructor(originalPath: string, isExternal: boolean) {
		this.path = this.originalPath = originalPath
		this.isExternal = isExternal
	}

	/** 获取当前文件的状态 */
	state = VFileState.initial

	/** 获取或设置当前文件关联的打包器 */
	bundler?: Bundler | false

	/** 获取当前文件加载后的快照，以便快速还原为加载状态 */
	loadSnapshot?: VFileSnapshot

	/** 获取或设置文件的 MIME 类型 */
	type?: string

	/** 判断或设置是否跳过保存当前文件 */
	noWrite?: boolean

	/** 全局唯一 ID */
	private static _id = 0

	/** 文件的哈希值 */
	private _hash?: string

	/** 获取文件的哈希值，每次重新构建后哈希值都会发生变化 */
	get hash() { return this._hash || (this._hash = (VFile._id++).toString(36) + Date.now().toString(36)) }
	set hash(value) { this._hash = value }

	/**
	 * 重置文件
	 * @param state 重置后的文件状态
	 */
	reset(state: VFileState) {
		this.state = state
		this.path = this.originalPath
		this.logs = this._sourceMapData = this.sourceMap = this.data = this._hash = this.noWrite = this.type = this.revision = this.loadSnapshot = this.bundler = undefined
		this.reportedLogCount = 0
		if (this.dependencies) this.dependencies.length = 0
		if (this.siblings) this.siblings.length = 0
		if (this.props) this.props.clear()
	}

	/** 创建当前文件对象的副本 */
	clone() {
		const file = Object.assign(new VFile(this.originalPath, this.isExternal), this) as VFile
		file._hash = undefined
		if (this.logs) file.logs = this.logs.slice(0)
		if (this.dependencies) file.dependencies = this.dependencies.slice(0)
		if (this.siblings) file.siblings = this.siblings.slice(0)
		if (this.props) file.props = new Map(this.props.entries())
		return file
	}

	// #endregion

	// #region 路径

	/** 获取或设置文件的最终路径 */
	path: string

	/** 获取或设置文件的最终文件夹路径 */
	get dir() { return getDir(this.path) }
	set dir(value) { this.path = setDir(this.path, value) }

	/** 获取或设置文件的最终文件名（不含扩展名） */
	get name() { return getName(this.path, false) }
	set name(value) { this.path = setName(this.path, value, false) }

	/** 获取或设置文件的最终扩展名（含点） */
	get ext() { return getExt(this.path) }
	set ext(value) { this.path = setExt(this.path, value) }

	/**
	 * 在文件名前追加内容
	 * @param value 要追加的内容
	 */
	prependName(value: string) { this.path = prependName(this.path, value) }

	/**
	 * 在文件名（不含扩展名部分）后追加内容
	 * @param value 要追加的内容
	 */
	appendName(value: string) { this.path = appendName(this.path, value) }

	/**
	 * 测试当前路径是否匹配指定的模式
 	 * @param pattern 要测试的匹配模式
	 */
	match(pattern: Pattern) { return match(this.path, pattern, isAbsolute(this.path) ? process.cwd() : undefined, false) }

	/**
	 * 测试当原始路径是否匹配指定的模式
 	 * @param pattern 要测试的匹配模式
 	 * @param options 附加选项
	 */
	matchOriginal(pattern: Pattern) { return match(this.originalPath, pattern, isAbsolute(this.path) ? process.cwd() : undefined, false) }

	/**
	 * 获取指定路径基于当前文件原始路径对应的路径
	 * @param path 要处理的路径
	 */
	resolvePath(path: string) { return isAbsolute(path) ? normalize(path) : joinPath(this.originalPath, "..", path) }

	/**
	 * 获取指定路径基于当前文件最终路径的相对路径
	 * @param path 要处理的路径
	 */
	relativePath(path: string) { return relativePath(this.dir, path) }

	// #endregion

	// #region 数据

	/** 判断当前文件对象是否不包含数据 */
	noData?: boolean

	/** 获取当前文件数据的修改次数 */
	revision?: number

	/** 文件的最终数据 */
	private _data?: string | Buffer | {
		[key: string]: any
		/** 生成文件的数据 */
		generate(file: VFile): {
			/** 文本内容或二进制数据 */
			data: string | Buffer
			/** 源映射（Source Map）数据 */
			sourceMap?: SourceMapData
		}
	}

	/**
	 * 获取或设置文件的最终数据
	 * - 字符串：该文件是文本文件，值是文本内容
	 * - Buffer：该文件是二进制文件，值是二进制字节数组
	 * - 对象：仅在首次需要时才调用 `generate()` 计算数据
	 */
	get data() {
		return this._data
	}
	set data(value) {
		if (this.revision === undefined) {
			this.revision = 0
		} else {
			this.revision++
		}
		this._data = value
	}

	/** 获取或设置文件的最终文本内容 */
	get content() {
		let data = this._data
		if (typeof data !== "string" && data != undefined) {
			if (data instanceof Buffer) {
				this._data = data = data.toString()
			} else {
				const result = data.generate(this)
				this._data = data = result.data.toString()
				this.applySourceMap(result.sourceMap)
			}
		}
		return data as string
	}
	set content(value) { this.data = value }

	/** 获取或设置文件的最终二进制内容 */
	get buffer() {
		let data = this._data
		if (!(data instanceof Buffer) && data != undefined) {
			if (typeof data === "string") {
				data = Buffer.from(data)
			} else {
				const result = data.generate(this)
				this._data = data = typeof result.data === "string" ? result.data : Buffer.from(result.data)
				this.applySourceMap(result.sourceMap)
			}
			this._data = data
		}
		return data as Buffer
	}
	set buffer(value) { this.data = value }

	/** 计算文件的字节大小 */
	get size() {
		return typeof this._data === "string" ? Buffer.byteLength(this._data) : this._data instanceof Buffer ? this._data.length : this._data == undefined ? 0 : Buffer.byteLength(this.content)
	}

	/** 计算文件的 MD5 值 */
	get md5() {
		return this._data == undefined ? undefined! : (require("../utils/crypto") as typeof import("../utils/crypto")).md5(this._data instanceof Buffer ? this._data : this.content)
	}

	/** 计算文件的 SHA-1 值 */
	get sha1() {
		return this._data == undefined ? undefined! : (require("../utils/crypto") as typeof import("../utils/crypto")).sha1(this._data instanceof Buffer ? this._data : this.content)
	}

	// #endregion

	// #region 源映射

	/** 判断当前文件是否需要生成源映射（Source Map）*/
	sourceMap?: boolean

	/** 当前文件关联的源映射（Source Map）数据 */
	private _sourceMapData?: SourceMapData | null

	/** 获取或设置当前文件关联的源映射（Source Map）数据 */
	get sourceMapData() {
		if (typeof this._data === "object" && this._data !== null && !(this._data instanceof Buffer)) {
			const result = this._data.generate(this)
			this._data = result.data
			this.applySourceMap(result.sourceMap)
		}
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
			for (let i = 0; i < value.sources.length; i++) {
				sourceMap.sources[i] = this.resolvePath(value.sources[i])
			}
		} else {
			this._sourceMapData = value
			this.sourceMap = false
		}
	}

	/** 获取或设置当前文件关联的源映射（Source Map）字符串 */
	get sourceMapString(): string | undefined { return this._sourceMapData ? toSourceMapString(this.sourceMapData!) : undefined }
	set sourceMapString(value) { this.sourceMapData = value }

	/** 获取或设置当前文件关联的源映射（Source Map）对象 */
	get sourceMapObject() { return this._sourceMapData ? this._sourceMapData = toSourceMapObject(this.sourceMapData!) : undefined }
	set sourceMapObject(value) { this.sourceMapData = value }

	/** 获取或设置当前文件关联的源映射（Source Map）构建器 */
	get sourceMapBuilder() { return this._sourceMapData ? this._sourceMapData = toSourceMapBuilder(this.sourceMapData!) : undefined }
	set sourceMapBuilder(value) { this.sourceMapData = value }

	/**
	 * 合并指定的新源映射（Source Map）
	 * @param sourceMap 要合并的新源映射
	 * @description
	 * 如果是第一次生成源映射，则本方法会直接保存源映射
	 * 如果基于当前文件内容生成了新文件内容，则本方法会将原有的源映射和新生成的源映射合并保存
	 */
	applySourceMap(sourceMap: SourceMapData | null | undefined) {
		const exists = this.sourceMapBuilder
		this.sourceMapData = sourceMap
		if (exists) {
			const builder = this.sourceMapBuilder
			if (builder) {
				builder.applySourceMap(exists)
			}
		}
	}

	// #endregion

	// #region 日志

	/** 获取当前文件相关的所有日志 */
	logs?: VFileLogEntry[]

	/** 获取已报告的日志数 */
	reportedLogCount = 0

	/**
	 * 添加一个日志
	 * @param log 要格式化的日志
	 * @param level 日志的等级
	 * @returns 返回日志对象
	 */
	addLog(log: string | Error | VFileLogEntry, level?: LogLevel) {
		if (typeof log === "string") {
			log = { level, message: log, raw: log }
		} else if (log instanceof Error) {
			log = { level, message: log.message, error: log, showStack: true, raw: log }
		} else {
			log = { level, ...log, raw: log }
			if (log.message === undefined && log.error != undefined) {
				log.message = log.error.message || log.error.toString()
				log.showStack = log.showStack !== false
			}
		}
		log.fileName = log.fileName == undefined ? this.originalPath : this.resolvePath(log.fileName)
		if (log.line != undefined || log.index != undefined) {
			const computeOriginalLocation = log.content === undefined && log.fileName === this.originalPath
			if (computeOriginalLocation) {
				log.content = this.content
			}
			if (log.line == undefined && log.content != undefined) {
				const loc = indexToLineColumn(log.content, log.index!)
				log.line = loc.line
				log.column = loc.column
				if (log.endLine == undefined && log.endIndex != undefined) {
					const endLoc = indexToLineColumn(log.content, log.endIndex)
					log.endLine = endLoc.line
					log.endColumn = endLoc.column
				}
			}
			// 为了方便用户排错，尽量显示原始错误位置，而不是显示临时的生成状态
			// 如果源码未修改，则当前文件内容即源码；如果源码已修改，使用源映射检索原位置；如果不存在源映射，则不计算原位置
			if (computeOriginalLocation) {
				for (let file: VFile | undefined = this, revision = this.revision, map = this.sourceMapData; log.line != undefined; revision = file.sourceFileRevision, map = file.sourceFileSourceMapData, file = file.sourceFile) {
					if (map) {
						const sourceMapBuilder = toSourceMapBuilder(map)
						const source = sourceMapBuilder.getSource(log.line, log.column || 0, true, true)
						if (!source || source.sourcePath == undefined) {
							break
						}
						if (!log.originalLocation) {
							log.originalLocation = {
								fileName: log.fileName,
								line: log.line,
								column: log.column,
								endLine: log.endLine,
								endColumn: log.endColumn,
							}
						}
						if (log.fileName !== source.sourcePath) {
							log.fileName = source.sourcePath
							log.content = undefined
						}
						log.line = source.line
						if (log.column != undefined) {
							log.column = source.column
						}
						if (log.endLine != undefined) {
							const endSource = sourceMapBuilder.getSource(log.endLine, log.endColumn || 0, true, true)
							if (endSource && endSource.sourcePath != undefined && source.sourcePath === endSource.sourcePath) {
								log.endLine = endSource.line
								if (log.endColumn != undefined) {
									log.endColumn = endSource.column
								}
							} else {
								log.endLine = log.endColumn = undefined
							}
						}
					} else if (revision! > 0) {
						// 文件已修改，且缺少源映射，无法定位实际位置
						break
					}
					// 如果是子文件则改成在父文件的位置
					if (!file.sourceFile || typeof file.sourceFileData !== "string" || file.sourceFileIndex === undefined || log.line == undefined || log.fileName !== this.originalPath) {
						break
					}
					if (!log.originalLocation) {
						log.originalLocation = {
							fileName: log.fileName,
							line: log.line,
							column: log.column,
							endLine: log.endLine,
							endColumn: log.endColumn,
						}
					}
					const offsetLoc = indexToLineColumn(file.sourceFileData, file.sourceFileIndex)
					log.fileName = file.sourceFile.originalPath
					log.content = file.sourceFileData
					if (log.line === 0 && log.column != undefined) {
						log.column += offsetLoc.column
					}
					log.line += offsetLoc.line
					if (log.endLine != undefined) {
						if (log.endLine == 0 && log.endColumn != undefined) {
							log.endColumn += offsetLoc.column
						}
						log.endLine += offsetLoc.line
					}
				}
			}
		}
		const logs = this.logs || (this.logs = [])
		logs.push(log)
		return log
	}

	/** 判断当前文件是否包含错误 */
	get hasErrors() { return this.logs ? this.logs.some(log => log.level === LogLevel.error) : false }

	/**
	 * 添加一个错误
	 * @param error 错误的内容
	 */
	addError(log: string | Error | VFileLogEntry) {
		return this.addLog(log, LogLevel.error)
	}

	/** 判断当前文件是否包含警告 */
	get hasWarnings() { return this.logs ? this.logs.some(log => log.level === LogLevel.warning) : false }

	/**
	 * 添加一个警告
	 * @param warning 警告的内容
	 */
	addWarning(log: string | Error | VFileLogEntry) {
		return this.addLog(log, LogLevel.warning)
	}

	// #endregion

	// #region 依赖

	/** 获取当前文件的所有依赖 */
	dependencies?: VFileDependency[]

	/**
	 * 添加一个依赖，当依赖的文件更新后当前文件需新加载
	 * @param target 依赖的文件路径（相对于当前文件）或文件对象或文件列表或详情
	 * @returns 返回依赖对象
	 */
	addDependency(target: string | VFile | VFileDependency) {
		const dependency = typeof target === "string" ? { path: this.resolvePath(target) } : target instanceof VFile ? { file: target } : { ...target }
		const dependencies = this.dependencies || (this.dependencies = [])
		dependencies.push(dependency)
		return dependency
	}

	// #endregion

	// #region 更新

	/**
	 * 更新文件的数据
	 * @param data 要更新的文件数据
	 * @param sourceMap 要合并的源映射（Source Map）
	 * @param logs 要报告的日志
	 * @param dependencies 要添加的依赖
	 */
	update(data: VFile["data"], sourceMap?: VFile["sourceMapData"], logs?: readonly (string | Error | VFileLogEntry)[], dependencies?: readonly (string | VFile | VFileDependency)[]) {
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
	 * 增删当前文件的内容并更新源映射
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
	 * 替换当前文件的内容并更新源映射
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
	getProp(key: any) {
		return this.props && this.props.get(key)
	}

	/**
	 * 设置指定的自定义属性
	 * @param key 属性名
	 * @param value 属性值
	 */
	setProp(key: any, value: any) {
		(this.props || (this.props = new Map())).set(key, value)
	}

	/**
	 * 删除指定的自定义属性
	 * @param key 属性名
	 * @returns 如果已成功删除属性则返回 `true`，否则说明属性不存在，返回 `false`
	 */
	deleteProp(key: any) {
		return this.props ? this.props.delete(key) : false
	}

	// #endregion

	// #region 子文件

	/** 获取生成当前文件的原始文件或自身 */
	get originalFile() {
		let file: VFile = this
		while (file.sourceFile) {
			file = file.sourceFile
		}
		return file
	}

	/** 如果当前文件是从其它文件生成的，则获取源文件 */
	sourceFile?: VFile

	/** 获取构建当前文件时同时生成的兄弟文件 */
	siblings?: VFile[]

	/**
	 * 添加一个同时生成的兄弟文件，兄弟文件会随当前文件一起保存
	 * @param path 要添加的兄弟文件路径（相对于当前文件路径）
	 * @param data 要添加的兄弟文件数据
	 */
	addSibling(path: VFile["path"], data: VFile["data"]) {
		const sibling = new VFile(path, true)
		sibling.sourceFile = this
		Object.defineProperty(sibling, "state", { get(this: VFile) { return this.sourceFile!.state }, set() { } })
		if (isAbsolute(path)) {
			sibling.path = path
		} else {
			Object.defineProperty(sibling, "path", {
				get(this: VFile) { return joinPath(this.sourceFile!.path, "..", path) },
				set(this: VFile, value: string) { Object.defineProperty(this, "path", { value: value, writable: true }) },
				configurable: true
			})
		}
		sibling.data = data
		const siblings = this.siblings || (this.siblings = [])
		siblings.push(sibling)
		return sibling
	}

	/** 如果当前文件是其它文件的一部分，则获取其在所在文件的内容 */
	sourceFileData?: string | Buffer

	/** 如果当前文件是其它文件的一部分，则获取其在所在文件的源映射数据 */
	sourceFileSourceMapData?: VFile["sourceMapData"]

	/** 如果当前文件是其它文件的一部分，则获取其在所在文件的版本 */
	sourceFileRevision?: VFile["revision"]

	/** 如果当前文件是其它文件的一部分，则获取其在所在文件的索引（从 0 开始） */
	sourceFileIndex?: number

	/**
	 * 由当前文件截取其中一部分创建新的子文件
	 * @param path 新文件的初始路径（相对于当前文件路径）
	 * @param data 新文件的数据
	 * @param index 子文件在当前文件数据的索引（从 0 开始）
	 */
	createSubfile(path?: VFile["path"], data = this.data, index = 0) {
		const file = new VFile(path != undefined ? this.resolvePath(path) : this.originalPath, true)
		file.sourceFile = this
		// 必须先读取 sourceMapData 以展开延迟计算的数据
		file.sourceFileSourceMapData = this.sourceMapData
		file.sourceFileRevision = this.revision
		file.sourceFileData = this.data as string | Buffer
		file.sourceFileIndex = index
		file.data = data
		return file
	}

	// #endregion

}

/** 表示资源文件的状态 */
export const enum VFileState {
	/** 初始状态 */
	initial = 0,
	/** 文件正在加载 */
	loading = 1 << 0,
	/** 文件已加载 */
	loaded = 1 << 1,
	/** 文件正在生成 */
	emitting = 1 << 2,
	/** 文件已生成 */
	emitted = 1 << 3,
	/** 文件已被删除 */
	deleted = 1 << 4,
	/** 文件已删除但未处理 */
	deleting = 1 << 5,
	/** 文件已修改但未处理 */
	changing = 1 << 6,
	/** 文件已创建但未处理 */
	creating = 1 << 7,
}

/** 表示一个文件快照 */
export class VFileSnapshot {

	/** 文件的 MIME 类型  */
	readonly type?: VFile["type"]

	/** 是否跳过保存当前文件  */
	readonly noWrite?: VFile["noWrite"]

	/** 文件的最终路径 */
	readonly path: VFile["path"]

	/** 文件的最终数据 */
	readonly data?: VFile["data"]

	/** 文件是否需要生成源映射（Source Map） */
	readonly sourceMap?: VFile["sourceMap"]

	/** 文件关联的源映射（Source Map）数据 */
	readonly sourceMapData?: VFile["sourceMapData"]

	/** 文件日志数 */
	readonly logCount: number

	/** 文件的依赖数 */
	readonly dependencyCount: number

	/** 文件的兄弟文件数 */
	readonly siblingCount: number

	/**
	 * 初始化一个新的文件快照
	 * @param file 要备份的文件对象
	 */
	constructor(file: VFile) {
		this.noWrite = file.noWrite
		this.type = file.type
		this.path = file.path
		this.data = file.data
		this.sourceMap = file.sourceMap
		this.sourceMapData = file.sourceMapData
		this.logCount = file.logs ? file.logs.length : 0
		this.dependencyCount = file.dependencies ? file.dependencies.length : 0
		this.siblingCount = file.siblings ? file.siblings.length : 0
	}

	/**
	 * 从当前快照还原文件数据
	 * @param file 要还原的目标文件
	 */
	restore(file: VFile) {
		file.noWrite = this.noWrite
		file.type = this.type
		file.path = this.path
		file.data = this.data
		file.sourceMap = this.sourceMap
		file.sourceMapData = this.sourceMapData
		if (file.logs) file.logs.length = this.logCount
		file.reportedLogCount = 0
		if (file.dependencies) file.dependencies.length = this.dependencyCount
		if (file.siblings) file.siblings.length = this.siblingCount
	}

}

/** 表示一个文件的依赖项 */
export interface VFileDependency {
	[key: string]: any
	/** 依赖的路径 */
	path?: string
	/** 依赖的文件对象 */
	file?: VFile
	/**
	 * 指定如何监听依赖
	 * - `"reload"`（默认）: 当依赖文件修改或删除后，重新构建当前文件
	 * - `"reloadOnDelete"`: 当依赖文件删除后，重新构建当前文件
	 * - `"reemit"`: 当依赖文件修改后，重新生成当前文件；当依赖文件删除后，重新构建当前文件
	 * - `false`: 不监听依赖
	 */
	watch?: "reload" | "reloadOnDelete" | "reemit" | false
	/** 依赖的来源 */
	source?: string
	/** 依赖的类型 */
	type?: string
}

/** 表示一个文件的日志 */
export interface VFileLogEntry extends LogEntry {
	/** 日志的等级 */
	level?: LogLevel
	/** 经过处理前的原始日志对象 */
	raw?: string | Error | VFileLogEntry
	/** 重定位之前的位置 */
	originalLocation?: Pick<LogEntry, "fileName" | "line" | "column" | "endLine" | "endColumn">
	/** 日志相关的源索引（从 0 开始）*/
	index?: number
	/** 日志相关的源结束索引（从 0 开始）*/
	endIndex?: number
}