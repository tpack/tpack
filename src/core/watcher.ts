import { Stats } from "fs"
import { ANSIColor, color, formatTree } from "../utils/ansi"
import { AsyncQueue } from "../utils/asyncQueue"
import { FileSystemWatcher, FileSystemWatcherOptions } from "../utils/fileSystemWatcher"
import { formatDate } from "../utils/misc"
import { containsPath, getDir } from "../utils/path"
import { BuildContext, Builder, BuildMode } from "./builder"
import { i18n } from "./i18n"
import { VFile, VFileState, VFileDependency } from "./vfile"

/** 表示一个文件监听器 */
export class Watcher extends FileSystemWatcher {

	// #region 选项

	/** 获取所属的构建器 */
	readonly builder: Builder

	/**
	 * 初始化新的开发服务器
	 * @param builder 所属的构建器对象
	 * @param options 监听器的附加选项
	 */
	constructor(builder: Builder, options?: WatcherOptions) {
		super(options)
		this.builder = builder
		if (options) {
			if (options.mode !== undefined) {
				// @ts-ignore
				this.mode = typeof options.mode === "string" ? WatchMode[options.mode] : options.mode
			}
		}
	}

	// #endregion

	// #region 监听实现

	/** 获取监听的模式 */
	readonly mode: WatchMode = WatchMode.partial

	/**
	 * 启用监听器
	 */
	async start() {
		await new Promise<void>(resolve => {
			super.add(this.builder.rootDir, error => {
				if (error) {
					this.builder.logger.fatal(error)
				} else if (!this.builder.server) {
					this.builder.logger.info(`${color(i18n`Started watching`, ANSIColor.brightCyan)} ${this.builder.logger.formatPath(this.builder.rootDir)}`, true)
				}
				resolve()
			})
		})
		// 监听服务不能中断
		try {
			await this.buildQueue.then(async () => {
				await this.builder.build()
			})
		} catch (e) {
			this.builder.logger.fatal(e)
		}
	}

	/**
	 * 关闭监听器
	 */
	async close() {
		await new Promise(resolve => {
			super.close(() => {
				if (!this.builder.noWrite) {
					this.builder.logger.info(`${color(i18n`Stopped watching`, ANSIColor.brightYellow)} ${this.builder.logger.formatPath(this.builder.rootDir)}`, true)
				}
				resolve()
			})
		})
	}

	ignored(path: string) {
		// 忽略外部文件，被当前文件依赖的除外
		if (!this.builder.isExternalPath(path)) {
			return false
		}
		const file = this.builder.files.get(path)
		if (!file) {
			return true
		}
		const dependencies = this.dependencies.get(file)
		return !dependencies || dependencies.size === 0
	}

	add(path: string, callback?: (error: NodeJS.ErrnoException | null, sucess: boolean) => void) {
		if (containsPath(this.builder.rootDir, path)) {
			callback && callback(null, false)
			return
		}
		super.add(this.usePolling ? path : getDir(path), callback)
	}

	remove(path: string) {
		if (containsPath(this.builder.rootDir, path)) {
			return
		}
		super.remove(path)
	}







	protected onCreate(path: string, stats: Stats) {
		super.onCreate(path, stats)
		this.commitUpdate(path, VFileState.creating)
	}

	protected onChange(path: string, stats: Stats, lastWriteTime: number) {
		super.onChange(path, stats, lastWriteTime)
		this.commitUpdate(path, VFileState.changing)
	}

	protected onDelete(path: string, lastWriteTime: number) {
		super.onDelete(path, lastWriteTime)
		this.commitUpdate(path, VFileState.deleting)
	}

	protected onError(e: NodeJS.ErrnoException, path: string) {
		super.onError(e, path)
		this.builder.logger.error({ source: i18n`Watcher`, fileName: path, error: e })
	}

	// #endregion

	// #region 增量构建

	/** 确保同时只执行一个任务 */
	readonly buildQueue = new AsyncQueue()

	/** 判断是否已触发更新 */
	private _isUpdating = false

	/** 开始重新构建的计时器 */
	private _rebuildTimer?: ReturnType<typeof setTimeout>

	/** 在监听到文件改变到开始构建等待的毫秒数 */
	readonly buildDelay = 128

	/** 构建完成的回调函数 */
	private _buildCallback?: () => void

	/**
	 * 记录一个文件已更新
	 * @param path 已更新的文件绝对路径
	 * @param state 要更新的状态
	 * @returns 返回受影响的文件数
	 */
	commitUpdate(path: string, state: VFileState) {
		// 如果之前有文件被修改但未开始构建，则和之前的文件一起构建
		if (this._isUpdating) {
			const file = this.builder.getFile(path)
			this._updateFile(file, state, file, 0)
			// 重新计时
			if (this._rebuildTimer) {
				clearTimeout(this._rebuildTimer)
				this._rebuildTimer = setTimeout(this._rebuild, this.buildDelay)
			}
			return
		}
		this._isUpdating = true
		// 等待本次构建结束后开始新一轮构建流程
		return this.buildQueue.then(() => new Promise(resolve => {
			const file = this.builder.getFile(path)
			this._updateFile(file, state, file, 0)
			this._buildCallback = resolve
			this._rebuildTimer = setTimeout(this._rebuild, this.buildDelay)
		}))
	}

	/** 等待应用的更新记录 */
	readonly updatedFiles: VFile[] = []

	/** 已更新的文件日志 */
	private readonly _updatedTitles: { indent: number, icon?: string, content: string }[] = []

	/**
	 * 更新文件的状态
	 * @param file 要更新的文件
	 * @param state 要更新的状态
	 * @param relatedTarget 实际发生改变的文件
	 * @param depth 依赖的层次
	 * @returns 返回受影响的文件数
	 */
	private _updateFile(file: VFile, state: VFileState, relatedTarget: VFile, depth: number) {
		// 不重复更新
		if (file.state === state || depth && file.state & (VFileState.creating | VFileState.changing | VFileState.deleting)) {
			return
		}
		// 重置状态
		file.state = state
		this.updatedFiles.push(file)
		this._updatedTitles.push({
			indent: depth,
			icon: color(formatDate(new Date(), "[HH:mm:ss]"), ANSIColor.brightBlack) + (depth ? "   " : " "),
			content: `${depth ? "" : (state === VFileState.changing ? color(i18n`*`, ANSIColor.brightCyan) : state === VFileState.creating ? color(i18n`+`, ANSIColor.brightBlue) : color(i18n`-`, ANSIColor.brightYellow)) + " "}${this.builder.logger.formatPath(file.originalPath)}`
		})
		this.builder.emit("updateFile", file, relatedTarget)
		// 重新生成依赖当前文件的文件
		const dependencies = this.dependencies.get(file)
		if (dependencies) {
			for (const dependency of dependencies) {
				this._updateFile(dependency, VFileState.changing, relatedTarget, depth + 1)
			}
		}
		// 更新可能间接影响的文件
		switch (state) {
			// 如果一个文件被删除了，则引用当前文件的文件可能出错
			case VFileState.deleting:
				for (const other of this.builder.files.values()) {
					if (other.dependencies) {
						for (const reference of other.dependencies) {
							if (reference.watch === "reloadOnDelete" && (reference.file ? reference.file === file : reference.path === file.originalPath)) {
								this._updateFile(other, VFileState.changing, relatedTarget, depth + 1)
							}
						}
					}
				}
				break
			// 如果创建了一个新文件，则原来存在找不到文件的错误可能被修复了，重新编译所有带错误的文件
			case VFileState.creating:
				for (const other of this.builder.filesWithLog.keys()) {
					this._updateFile(other, VFileState.changing, relatedTarget, depth + 1)
				}
				break
		}
	}

	/** 重新构建整个项目 */
	private _rebuild = async () => {
		this._isUpdating = false
		this._rebuildTimer = undefined
		for (const file of this.updatedFiles) {
			await this.resetFile(file)
		}
		try {
			// 清除日志
			this._clearAllLogs()
			// 打印本次修改的内容
			this.builder.logger.log(formatTree(this._updatedTitles))
			// 构建
			const context = await this.builder.build(BuildMode.incremental, this.mode === WatchMode.full ? undefined : this.updatedFiles, false)
			// 重新打印未重新构建的文件的日志
			await this._reportAllLogs(context)
			// 报告本次构建结果
			if (this.builder.reporter && !context.aborted) {
				this.builder.reporter(context, this.builder)
			}
		} catch (e) {
			this.builder.logger.fatal(e)
		} finally {
			this.updatedFiles.length = this._updatedTitles.length = 0
			const resolve = this._buildCallback!
			this._buildCallback = undefined
			resolve()
		}
	}

	/**
	 * 重置指定的文件，清除已生成的文件、缓存
	 * @param file 要重置的文件
	 */
	async resetFile(file: VFile) {
		// 重置兄弟文件
		if (file.siblings) {
			for (const sibling of file.siblings) {
				await this.resetFile(sibling)
			}
		}
		// // 从加载快照还原
		// const snapshort = file.loadSnapshot
		// if (snapshort) {
		// 	// 清除错误
		// 	if ((file.hasErrors || file.hasWarnings) && !snapshort.errorCount && !snapshort.warningCount) {
		// 		this.builder.errorOrWarningFiles.delete(file)
		// 	}
		// 	// 清除依赖
		// 	if (file.dependencies) {
		// 		for (let i = snapshort.dependencyCount; i < file.dependencies.length; i++) {
		// 			this.removeDependency(file, file.dependencies[i])
		// 		}
		// 	}
		// 	snapshort.restore(file)
		// 	file.state = VFileState.loaded
		// 	return
		// }
		// 清除错误
		if (file.hasErrors || file.hasWarnings) {
			this.builder.filesWithLog.delete(file)
		}
		// 清除依赖
		if (file.dependencies) {
			for (const dependency of file.dependencies) {
				this.removeDependency(file, dependency.file || dependency.path!)
			}
		}
		// 删除文件
		if (!file.noWrite && file.state === VFileState.deleting) {
			const key = this.builder.relativePath(file.path)
			if (this.builder.emittedFiles.get(key) === file) {
				this.builder.emittedFiles.delete(key)
				if (!this.builder.noWrite) {
					const deletingTask = this.builder.logger.begin(i18n`Deleting`, this.builder.logger.formatPath(file.originalPath))
					try {
						const outPath = this.builder.getOutputPath(file.path)
						if (await this.builder.fs.deleteFile(outPath)) {
							this.builder.fs.deleteParentDirIfEmpty(outPath)
						}
					} finally {
						this.builder.logger.end(deletingTask)
					}
				}
			}
		}
		await this.builder.emit("resetFile", file)
		file.reset(file.state === VFileState.deleting ? VFileState.deleted : VFileState.initial)
		file.sourceMap = this.builder.sourceMap
	}

	/** 获取每个文件更新后受影响的文件列表，键为更新的文件绝对路径，值为所有受影响的文件对象 */
	readonly dependencies = new Map<VFile, Set<VFile>>()

	/**
	 * 添加文件的依赖项
	 * @param file 原文件
	 * @param dependencyFile 依赖的文件
	 */
	addDependency(file: VFile, dependency: VFileDependency) {
		const dependencyFile = dependency.file || this.builder.getFile(dependency.path!)
		if (dependencyFile.state & (VFileState.creating | VFileState.changing | VFileState.deleting)) {
			file.state = VFileState.changing
		}
		if (dependencyFile.state & (VFileState.creating | VFileState.changing | VFileState.deleting)) {
			file.state = VFileState.changing
		}
		let dependencies = this.dependencies.get(dependencyFile)
		if (!dependencies) {
			dependencies = new Set()
			this.dependencies.set(dependencyFile, dependencies)
		}
		if (!dependencies.size && dependencyFile.isExternal) {
			this.add(dependencyFile.originalPath)
		}
		dependencies.add(file)
	}

	/**
	 * 移除文件的依赖项
	 * @param file 原文件
	 * @param dependency 依赖的文件
	 */
	removeDependency(file: VFile, dependency: VFile | string) {
		dependency = typeof dependency === "string" ? this.builder.getFile(dependency) : dependency
		const dependencies = this.dependencies.get(dependency)
		if (dependencies) {
			dependencies.delete(file)
			if (!dependencies.size && dependency.isExternal) {
				this.remove(dependency.originalPath)
			}
		}
	}

	/**
	 * 添加要监听的文件
	 * @param file 要监听的文件
	 */
	addFile(file: VFile) {
		if (file.siblings) {
			for (const sibling of file.siblings) {
				this.addFile(sibling)
			}
		}
		// 入口文件已全局监听
		if (!file.sourceFile && file.isExternal) {
			this.add(file.originalPath)
		}
		if (file.dependencies) {
			for (const dependency of file.dependencies) {
				if (dependency.watch === "reloadOnDelete") {
					const target = dependency.file ? dependency.file.originalFile : this.builder.getFile(dependency.path!)
					if (target.state === VFileState.deleting) {
						file.state = VFileState.changing
					}
				} else {
					this.addDependency(file, dependency)
				}
			}
		}
	}

	/** 清空已报告的所有错误和警告 */
	private _clearAllLogs() {
		this.builder.logger.clear()
		for (const file of this.builder.filesWithLog) {
			file.reportedLogCount = 0
		}
	}

	/** 重新报告所有错误 */
	private async _reportAllLogs(context: BuildContext) {
		for (const file of this.builder.filesWithLog) {
			await this.builder.reportLogs(file, context)
		}
	}

	// #endregion

}

/** 表示监听器的选项 */
export interface WatcherOptions extends FileSystemWatcherOptions {
	/**
	 * 监听的模式
	 * @default "partial"
	 */
	mode?: keyof typeof WatchMode | WatchMode
}

/** 表示监听的模式 */
export const enum WatchMode {
	/** 全量模式：当文件更新后执行完整构建流程 */
	full,
	/** 部分模式：当文件更新后只重新构建更新的文件 */
	partial,
}