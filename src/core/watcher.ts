import { Stats } from "fs"
import { ANSIColor, color, formatTree } from "../utils/ansi"
import { FileSystemWatcher, FileSystemWatcherOptions } from "../utils/fileSystemWatcher"
import { Matcher, Pattern } from "../utils/matcher"
import { formatDate } from "../utils/misc"
import { getDir } from "../utils/path"
import { Builder } from "./builder"
import { i18n } from "./i18n"
import { Module, ModuleDependencyType, ModuleState } from "./module"

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
		this.ignoreMatcher = builder.createMatcher(options && options.ignore !== undefined ? options.ignore : [".DS_Store", ".git", "Desktop.ini", "Thumbs.db", "ehthumbs.db", "*~"])
	}

	// #endregion

	// #region 添加删除

	/** 启用监听器 */
	async start() {
		// 正常构建以获取模块的依赖关系
		try {
			await this.builder.build()
		} catch (e) {
			// 监听服务不能中断，忽略一切错误
			this.builder.logger.fatal(e)
		}
		const initWatcherTask = this.builder.logger.begin(i18n`Initializing watching`, this.builder.logger.formatPath(this.builder.rootDir))
		try {
			await new Promise<void>(resolve => {
				super.add(this.builder.rootDir, error => {
					if (error) {
						this.builder.logger.fatal(error)
					}
					resolve()
				})
			})
		} finally {
			this.builder.logger.end(initWatcherTask)
		}
		if (!this.builder.server) {
			this.builder.logger.info(`${color(i18n`Started watching`, ANSIColor.brightCyan)} ${this.builder.logger.formatPath(this.builder.rootDir)} → ${this.builder.logger.formatPath(this.builder.outDir)}`, true)
		}
	}

	/** 关闭监听器 */
	async close() {
		await new Promise(resolve => {
			super.close(resolve)
		})
		if (!this.builder.server) {
			this.builder.logger.info(`${color(i18n`Stopped watching`, ANSIColor.brightYellow)} ${this.builder.logger.formatPath(this.builder.rootDir)}`, true)
		}
	}

	/** 忽略匹配器 */
	readonly ignoreMatcher: Matcher

	ignored(path: string) { return this.ignoreMatcher.test(path) }

	protected onError(e: NodeJS.ErrnoException, path: string) {
		super.onError(e, path)
		this.builder.logger.error({ source: i18n`Watcher`, fileName: path, message: e.message, stack: e.stack, error: e })
	}

	/**
	 * 添加要监听的模块
	 * @param module 要监听的模块
	 */
	addModule(module: Module) {
		// 入口模块已全局监听
		if (!module.isEntryModule) {
			this.add(this.usePolling ? module.originalPath : getDir(module.originalPath))
		}
		// 记录依赖
		if (module.dependencies) {
			for (const dependency of module.dependencies) {
				if (dependency.inline) {
					if (dependency.module) {
						this.addDependency(module, dependency.module, true)
					}
					continue
				}
				switch (dependency.type) {
					case ModuleDependencyType.staticImport:
						if (dependency.module) {
							this.addDependency(module, dependency.module, false)
						}
						break
					case ModuleDependencyType.external:
						this.addDependency(module, dependency.module || this.builder.getModule(dependency.path as string), true)
						break
					case ModuleDependencyType.externalList:
						// todo
						break
				}
			}
		}
		// 如果模块存在错误或警告，强制重新构建
		if (module.logs && module.logs.length) {
			if (module.originalModule) {
				this.updateModule(module.originalModule, UpdateType.forceReemit, module, 0)
			} else {
				this.updateModule(module, UpdateType.forceReload, module, 0)
			}
		}
	}

	/** 每个模块更新后要重新加载的模块列表，键为更新的模块绝对路径，值为所有模块与是否需要重新加载的键值对 */
	private readonly _dependencies = new Map<Module, Map<Module, boolean>>()

	/**
	 * 添加模块的依赖项
	 * @param module 原模块
	 * @param dependencyModule 依赖模块
	 * @param reload 是否需要全部重新加载
	 */
	addDependency(module: Module, dependencyModule: Module, reload: boolean) {
		let dependencies = this._dependencies.get(dependencyModule)
		if (!dependencies) {
			this._dependencies.set(dependencyModule, dependencies = new Map())
			if (!dependencyModule.isEntryModule) {
				this.add(this.usePolling ? dependencyModule.originalPath : getDir(dependencyModule.originalPath))
			}
		}
		if (reload || !dependencies.has(module)) {
			dependencies.set(module, reload)
		}
	}

	/**
	 * 移除模块的依赖项
	 * @param module 原模块
	 * @param dependencyModule 依赖模块
	 */
	removeDependency(module: Module, dependencyModule: Module) {
		const dependencies = this._dependencies.get(dependencyModule)
		if (dependencies) {
			dependencies.delete(module)
		}
	}

	// #endregion

	// #region 增量构建

	protected onCreate(path: string, stats: Stats) {
		super.onCreate(path, stats)
		this.update(path, UpdateType.create)
	}

	protected onChange(path: string, stats: Stats, lastWriteTime: number) {
		super.onChange(path, stats, lastWriteTime)
		this.update(path, UpdateType.change)
	}

	protected onDelete(path: string, lastWriteTime: number) {
		super.onDelete(path, lastWriteTime)
		this.update(path, UpdateType.delete)
	}

	/** 等待更新的所有模块 */
	private _pendingModules: Module[] = []

	/** 开始构建的计时器 */
	private _buildTimer?: ReturnType<typeof setTimeout>

	/** 在监听到文件改变到开始构建等待的毫秒数 */
	readonly buildDelay = 128

	/**
	 * 通知一个模块已更新
	 * @param path 已更新的模块绝对路径
	 * @param type 更新的类型
	 */
	update(path: string, type: UpdateType) {
		// 用户可能会在短时间多次修改模块，稍作延时然后统一构建能大幅提升效率
		// 先将更新模块放入队列
		const module = this.builder.getModule(path)
		if (this.updateModule(module, type, module, 0) === 0) {
			return
		}
		// 如果正在等待构建，则重新计时，直到用户不再更新模块
		if (this._buildTimer) {
			clearTimeout(this._buildTimer)
			this._buildTimer = setTimeout(this._build, this.buildDelay)
			return
		}
		// 如果正在构建模块，等待构建完成后会自动重新构建新的模块
		if (!this._buildingModules.length) {
			this._buildTimer = setTimeout(this._build, this.buildDelay)
		}
	}

	/**
	 * 更新指定的模块
	 * @param module 要更新的模块
	 * @param type 更新的类型
	 * @param relatedTarget 实际发生改变的模块
	 * @param depth 依赖的层次
	 * @returns 返回需要重新构建的模块数
	 */
	protected updateModule(module: Module, type: UpdateType, relatedTarget: Module, depth: number) {
		// 避免重复更新模块
		if (module.updateType === type) {
			return 0
		}
		if (module.updateType !== undefined && !(module.updateType & (UpdateType.forceReload | UpdateType.forceReemit))) {
			module.updateType = type
			return 0
		}
		module.updateType = type
		let count = 0
		if (!(type & (UpdateType.forceReload | UpdateType.forceReemit))) {
			this._pendingTreeLogs.push({
				indent: depth,
				icon: color(formatDate(new Date(), "[HH:mm:ss]"), ANSIColor.brightBlack) + (depth ? "   " : " "),
				content: `${depth ? "" : (module.updateType === UpdateType.change || module.updateType === UpdateType.dependency ? color(i18n`*`, ANSIColor.brightCyan) : module.updateType === UpdateType.create ? color(i18n`+`, ANSIColor.brightBlue) : color(i18n`-`, ANSIColor.brightYellow)) + " "}${this.builder.logger.formatPath(module.originalPath)}`
			})
		}
		// 更新依赖当前模块的模块
		const dependencies = this._dependencies.get(module)
		if (dependencies) {
			for (const [dependencyModule, reload] of dependencies.entries()) {
				if (dependencyModule.updateType === undefined) {
					count += this.updateModule(dependencyModule, type & (UpdateType.forceReload | UpdateType.forceReemit) ? reload ? UpdateType.forceReload : UpdateType.forceReemit : reload ? UpdateType.change : UpdateType.dependency, relatedTarget, depth + 1)
				}
			}
		}
		// 如果一个模块被删除了，则引用当前模块的模块可能出错
		if (type === UpdateType.delete) {
			for (const other of this.builder.modules.values()) {
				if (other.updateType === undefined && other.dependencies) {
					for (const dependency of other.dependencies) {
						if (dependency.module === module) {
							count += this.updateModule(other, UpdateType.dependency, relatedTarget, depth + 1)
							break
						}
					}
				}
			}
		}
		// 更新目标
		if (module.isEntryModule) {
			this._pendingModules.push(module)
			count++
		} else if (count === 0 && !(type & (UpdateType.forceReload | UpdateType.forceReemit))) {
			this._pendingTreeLogs.pop()
		}
		this.emit("updateModule", module, relatedTarget, depth)
		return count
	}

	/** 正在构建的所有模块 */
	private _buildingModules: Module[] = []

	/** 本次更新日志树的所有项 */
	private readonly _pendingTreeLogs: { indent: number, icon?: string, content: string }[] = []

	/** 构建整个项目 */
	private _build = async () => {
		this._buildTimer = undefined
		const buildingModules = this._pendingModules
		this._pendingModules = this._buildingModules
		this._buildingModules = buildingModules
		try {
			for (const module of buildingModules) {
				await this.resetModule(module)
			}
			// 清除日志
			this.clearLogs()
			// 打印本次修改的内容
			this.builder.logger.log(formatTree(this._pendingTreeLogs))
			this._pendingTreeLogs.length = 0
			// 构建
			const context = await this.builder.build(buildingModules, false)
			// 报告本次构建结果
			if (this.builder.reporter) {
				this.builder.reporter(context, this.builder)
			}
		} catch (e) {
			this.builder.logger.fatal(e)
		} finally {
			buildingModules.length = this._pendingTreeLogs.length = 0
			// 构建期间如果有新模块被修改，则继续构建
			if (this._pendingTreeLogs.length) {
				this._build()
			} else {
				this.onReady()
			}
		}
	}

	/**
	 * 重置指定的模块
	 * @param module 要重置的模块
	 */
	protected async resetModule(module: Module) {
		// 删除生成的模块
		if (module.generatedModules) {
			for (const generatedModule of module.generatedModules) {
				if (this.builder.emittedModules.get(generatedModule.path) === generatedModule) {
					this.builder.emittedModules.delete(generatedModule.path)
					if (module.updateType! & (UpdateType.delete | UpdateType.forceReload) && !this.builder.noWrite && !module.noWrite) {
						const outPath = this.builder.getOutputPath(generatedModule.path)
						const deletingTask = this.builder.logger.begin(i18n`Deleting`, this.builder.logger.formatPath(outPath))
						try {
							if (await this.builder.fs.deleteFile(outPath)) {
								this.builder.fs.deleteParentDirIfEmpty(outPath)
							}
						} finally {
							this.builder.logger.end(deletingTask)
						}
					}
				}
			}
		}
		if (module.updateType! & (UpdateType.dependency | UpdateType.forceReemit) && module.state === ModuleState.emitted) {
			if (module.generatedModules) {
				module.generatedModules.length = 0
			}
			module.state = ModuleState.loaded
		} else {
			// 清除依赖
			if (module.dependencies) {
				for (const dependency of module.dependencies) {
					if (dependency.inline) {
						if (dependency.module) {
							this.removeDependency(module, dependency.module)
						}
						continue
					}
					switch (dependency.type) {
						case ModuleDependencyType.staticImport:
							if (dependency.module) {
								this.removeDependency(module, dependency.module)
							}
							break
						case ModuleDependencyType.external:
							this.removeDependency(module, dependency.module || this.builder.getModule(dependency.path as string))
							break
						case ModuleDependencyType.externalList:
							// todo
							break
					}
				}
			}
			module.reset(module.updateType === UpdateType.delete ? ModuleState.deleted : ModuleState.initial)
			module.sourceMap = this.builder.sourceMap
		}
		module.updateType = undefined
		await this.builder.emit("resetModule", module)
	}

	/** 清空已报告的所有错误和警告 */
	protected clearLogs() {
		// this.builder.logger.log("-".repeat((process.stdout.columns || 80) - 1))
		this.builder.logger.clear()
	}

	/** 等待 */
	private readonly _readyCallballs: (() => void)[] = []

	/** 当所有模块已更新后执行 */
	protected onReady() {
		for (const callback of this._readyCallballs) {
			callback()
		}
		this._readyCallballs.length = 0
	}

	/** 返回确保所有文件都已是最新状态的确认对象 */
	ready() {
		if (!this._pendingTreeLogs.length && !this._buildingModules.length) {
			return Promise.resolve()
		}
		return new Promise(resolve => {
			this._readyCallballs.push(resolve)
		})
	}

	// #endregion

}

/** 表示监听器的选项 */
export interface WatcherOptions extends FileSystemWatcherOptions {
	/**
	 * 指定监听时忽略哪些文件，可以是通配符或正则表达式
	 * @default [".DS_Store", ".git", "Desktop.ini", "Thumbs.db", "ehthumbs.db", "*~"]
	 */
	ignore?: Pattern
}

/** 表示文件的修改类型 */
export const enum UpdateType {
	/** 文件内容被修改 */
	change = 1 << 0,
	/** 文件被创建 */
	create = 1 << 1,
	/** 文件被删除 */
	delete = 1 << 2,
	/** 依赖被更新 */
	dependency = 1 << 3,
	/** 模块存在错误或警告需要重新加载 */
	forceReload = 1 << 4,
	/** 模块存在错误或警告需要重新生成 */
	forceReemit = 1 << 5,
}