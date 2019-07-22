import { EventEmitter } from "events"
import { FSWatcher, readdir, stat, Stats, unwatchFile, watch, watchFile } from "fs"
import { join, normalize } from "path"
import { containsPath } from "./path"

/**
 * 表示一个文件系统监听器
 * @description
 * 本监听器的设计目标是：只针对常见场景，提供轻量、高效、稳定的实现，确保占用 CPU 极低且占用内存极小
 *
 * 1. 完全基于原生的 `fs.watch` 实现，低于 Node 10.12 版本不保证稳定性
 * 2. 可监听文件或文件夹（同时监听子文件夹），可动态调整监听列表，但监听的根路径必须已存在且不能删除
 * 3. 仅支持文件的增、删、改事件和文件夹的增、删事件，重命名操作会按先删除后创建处理
 * 4. 文件软链和硬链始终会被替换为链接的目标路径，循环链接会引发错误
 * 5. 在不支持 `fs.watch` 的系统（比如虚拟机）可开启 `usePolling`（基于原生 `fs.watchFile` 实现），但这会占用较高 CPU
 *
 * 如果以上不符合你的需求，请考虑使用 [chokidar](https://www.npmjs.com/package/chokidar)
 *
 * @example
 * const watcher = new FileSystemWatcher()
 * watcher.on("change", path => { console.log("Changed", path) })
 * watcher.on("delete", path => { console.log("Deleted", path) })
 * watcher.on("create", path => { console.log("Created", path) })
 * watcher.add(process.cwd(), () => { console.log("Start Watching...") })
 */
export class FileSystemWatcher extends EventEmitter {

	// #region 添加

	/**
	 * 初始化新的监听器
	 * @param options 附加选项
	 */
	constructor(options?: FileSystemWatcherOptions) {
		super()
		if (options) {
			if (options.delay !== undefined) {
				this.delay = options.delay
			}
			if (options.usePolling) {
				this.usePolling = true
				this.watchOptions.recursive = false
				if (options.interval !== undefined) {
					this.watchOptions.interval = options.interval
				}
				this._createWatcher = this._createPollingWatcher
			}
			if (options.persistent !== undefined) {
				this.watchOptions.persistent = options.persistent
			}
			if (options.ignored !== undefined) {
				this.ignored = options.ignored
			}
		}
	}

	/** 所有原生监听器对象，键为监听的路径，值为原生监听器对象 */
	private readonly _watchers = new Map<string, FSWatcher>()

	/**
	 * 添加要监听的文件或文件夹
	 * @param path 要添加的文件或文件夹路径
	 * @param callback 添加完成的回调函数，在回调执行前无法监听到文件的修改
	 * @param callback.error 如果添加成功则为空，否则为错误对象
	 * @param callback.success 是否已创建新的监听器
	 */
	add(path: string, callback?: (error: NodeJS.ErrnoException | null, success: boolean) => void) {
		path = normalize(path)
		if (path === ".") path = ""
		if (this._watchers.has(path)) {
			callback && callback(null, false)
			return
		}
		if (this.watchOptions.recursive) {
			for (const key of this._watchers.keys()) {
				// 如果已监听父文件夹，则忽略当前路径
				if (containsPath(key, path)) {
					callback && callback(null, false)
					return
				}
				// 如果已监听子文件或文件夹，则替换之
				if (containsPath(path, key)) {
					this._deleteWatcher(key)
				}
			}
		}
		this._createWatcher(path, callback, true)
	}

	/** 判断是否强制使用轮询监听，轮询监听可以支持更多的文件系统，但会占用大量 CPU */
	readonly usePolling = process.platform !== "win32" && process.platform !== "darwin" && process.platform !== "linux" && process.platform !== "aix"

	/** 获取或设置传递给原生监听器的选项 */
	watchOptions = {
		/** 是否在监听时阻止进程退出 */
		persistent: true,
		/** 是否使用原生的递归监听支持 */
		recursive: process.platform === "win32" || process.platform === "darwin",
		/** 轮询的间隔毫秒数 */
		interval: 2500,
	}

	/**
	 * 创建指定路径的原生监听器
	 * @param path 要监听的文件或文件夹路径
	 * @param callback 创建完成的回调函数，在回调执行前无法监听到文件的修改
	 * @param callback.error 如果创建成功则为空，否则为相关的错误
	 * @param callback.success 是否已创建新的监听器
	 * @param initStats 是否初始化路径对应的状态
	 * @returns 返回添加的监听器，如果无法添加则返回空
	 */
	private _createWatcher(path: string, callback?: (error: NodeJS.ErrnoException | null, success: boolean) => void, initStats?: boolean) {
		// 创建原生监听器
		let watcher: FSWatcher
		try {
			watcher = watch(path || ".", this.watchOptions)
		} catch (e) {
			callback && callback(e, false)
			return
		}
		this._watchers.set(path, watcher)
		// fs.watch 可能在调用时立即执行一次 onChange，等待文件夹状态添加后绑定事件
		const initWatcher = (error: NodeJS.ErrnoException | null) => {
			watcher.on("error", (error: NodeJS.ErrnoException) => {
				// Windows 下删除监听的空根文件夹引发 EPERM 错误
				if (error.code === "EPERM" && process.platform === "win32" && (error as any).filename === null) {
					const entries = this._stats.get(path)
					if (typeof entries === "object" && entries.length === 0) {
						return
					}
				}
				this.onError(error, path)
			}).on("change", typeof this._stats.get(path) === "number" ? () => {
				this.handleWatchChange(path)
			} : (event, fileName) => {
				// `event` 的值可能是 `rename` 或 `change`，`rename` 指创建、删除或重命名文件，`change` 指修改文件内容
				// 但有些 IDE 如果启用“安全保存”，则保存文件时会先新建临时文件，然后执行重命名，这会使得修改文件时也触发 `rename`
				// 因此无法通过 `rename` 区分实际的文件操作
				// 官方文档中描述 `fileName` 可能为空，但在 Node 10.12+ 中，Windows/MacOS/Linux/AIX 下 `fileName` 不可能为空
				// https://github.com/nodejs/node/blob/master/test/parallel/test-fs-watch.js
				if (fileName) {
					this.handleWatchChange(join(path, fileName as string))
				} else {
					this.handleWatchChange(path)
				}
			})
			callback && callback(error, true)
		}
		if (initStats) {
			this._initStats(path, false, initWatcher)
		} else {
			initWatcher(null)
		}
	}

	/**
	 * 创建指定路径的轮询监听器
	 * @param path 要监听的文件或文件夹路径
	 * @param callback 创建完成的回调函数，在回调执行前无法监听到文件的修改
	 * @param callback.error 如果创建成功则为空，否则为相关的错误
	 * @param callback.success 是否已创建新的监听器
	 * @param initStats 是否添加路径对应的状态
	 * @returns 返回添加的监听器，如果无法添加则返回空
	 */
	private _createPollingWatcher(path: string, callback?: (error: NodeJS.ErrnoException | null, success: boolean) => void, initStats?: boolean) {
		const handleChange = (stats: Stats, prevStats: Stats) => {
			// 理论上可以直接使用 stats，避免重新执行 fs.stat，但 usePolling 不常用且本身有性能问题，为简化程序，忽略 stats
			if (stats.size !== prevStats.size || stats.mtimeMs !== prevStats.mtimeMs || stats.mtimeMs === 0) {
				this.handleWatchChange(path)
			}
		}
		watchFile(path, this.watchOptions, handleChange)
		const watcher = {
			close() {
				unwatchFile(path, handleChange)
			}
		} as any as FSWatcher
		this._watchers.set(path, watcher)
		if (initStats) {
			this._initStats(path, false, error => {
				callback && callback(error, true)
			})
		} else {
			callback && callback(null, true)
		}
	}

	/**
	 * 所有文件或文件夹状态，对象的键是路径
	 * - 如果路径是一个文件，则值为文件的最后修改时间戳
	 * - 如果路径是一个文件夹，则值为所有直接子文件和子文件夹的名称数组
	 */
	private readonly _stats = new Map<string, string[] | number>()

	/** 正在执行的异步任务数 */
	private _pending = 0

	/**
	 * 初始化指定文件或文件夹的状态
	 * @param path 要添加的文件或文件夹路径
	 * @param isFile 是否优先将路径作为文件处理
	 * @param callback 已添加完成的回调函数
	 * @param depth 遍历的深度
	 */
	private _initStats(path: string, isFile: boolean, callback: (error: NodeJS.ErrnoException | null) => void) {
		this._pending++
		if (isFile) {
			stat(path, (error, stats) => {
				if (error) {
					callback(error)
				} else if (stats.isFile()) {
					this._stats.set(path, stats.mtimeMs)
					if (this.usePolling && this.isWatching && !this._watchers.has(path)) {
						this._createPollingWatcher(path)
					}
					callback(null)
				} else if (stats.isDirectory()) {
					this._initStats(path, false, callback)
				}
				if (--this._pending === 0) {
					this.emit("ready")
				}
			})
		} else {
			readdir(path, (error, entries) => {
				if (error) {
					if (error.code === "ENOTDIR" || error.code === "EEXIST") {
						this._initStats(path, true, callback)
					} else if (error.code === "EMFILE" || error.code === "ENFILE") {
						this._pending++
						setTimeout(() => {
							this._initStats(path, false, callback)
							if (--this._pending === 0) {
								this.emit("ready")
							}
						}, this.delay)
					} else {
						callback(error)
					}
				} else {
					this._stats.set(path, entries)
					if (!this.watchOptions.recursive && this.isWatching && !this._watchers.has(path)) {
						this._createWatcher(path)
					}
					let pending = 0
					let firstError: NodeJS.ErrnoException | null = null
					for (const entry of entries) {
						const child = join(path, entry)
						if (this.ignored(child)) {
							continue
						}
						pending++
						this._initStats(child, entry.includes(".", 1), error => {
							if (error && !firstError) {
								firstError = error
							}
							if (--pending === 0) {
								callback(firstError)
							}
						})
					}
					if (pending === 0) {
						callback(firstError)
					}
				}
				if (--this._pending === 0) {
					this.emit("ready")
				}
			})
		}
	}

	/**
	 * 判断是否忽略指定的路径
	 * @param path 要判断的文件或文件夹路径，路径的分隔符同操作系统
	 */
	ignored(path: string) {
		return /[\\\/](?:\.DS_Store|\.git|Desktop\.ini|Thumbs\.db|ehthumbs\.db)$|~$/.test(path)
	}

	/**
	 * 等待所有异步任务都完成后执行指定的回调函数
	 * @param callback 要执行的回调函数
	 */
	ready(callback: () => void) {
		if (this._pending > 0) {
			this.once("ready", callback)
		} else {
			callback()
		}
	}

	/**
	 * 判断是否正在监听指定的文件或文件夹
	 * @param path 要判断的路径
	 */
	isWatchingPath(path: string) {
		path = normalize(path)
		if (path === ".") path = ""
		for (const key of this._watchers.keys()) {
			if (containsPath(key, path)) {
				return true
			}
		}
		return false
	}

	/** 判断当前监听器是否正在监听 */
	get isWatching() { return this._watchers.size > 0 }

	// #endregion

	// #region 移除

	/**
	 * 移除指定路径的监听器
	 * @param path 要移除的文件或文件夹路径
	 * @param callback 移除完成后的回调函数
	 * @param callback.success 如果成功移除监听器则为 `true`，如果存在更上级的监听器，则为 `false`
	 * @description 注意如果已监听路径所在的文件夹，移除操作将无效
	 */
	remove(path: string, callback?: (success: boolean) => void) {
		path = normalize(path)
		if (path === ".") path = ""
		if (this.watchOptions.recursive) {
			this._deleteWatcher(path)
			if (this.isWatchingPath(path)) {
				callback && callback(false)
				return
			}
		} else {
			// 如果存在根监听器，不允许删除
			for (const key of this._watchers.keys()) {
				if (containsPath(key, path) && key !== path) {
					callback && callback(false)
					return
				}
			}
			// 删除当前监听器和子监听器
			for (const key of this._watchers.keys()) {
				if (containsPath(path, key)) {
					this._deleteWatcher(key)
				}
			}
		}
		// 移除不再监听的文件状态
		this.ready(() => {
			for (const key of this._stats.keys()) {
				if (containsPath(path, key)) {
					this._stats.delete(key)
				}
			}
			callback && callback(true)
		})
	}

	/**
	 * 删除指定路径的原生监听器
	 * @param path 要删除监听的文件或文件夹路径
	 */
	private _deleteWatcher(path: string) {
		const watcher = this._watchers.get(path)
		if (watcher) {
			// Windows: Node 10.0-10.4：调用 close() 会导致进程崩溃
			watcher.close()
			this._watchers.delete(path)
		}
	}

	/**
	 * 移除已添加的所有监听器
	 * @param callback 移除完成后的回调函数
	 */
	close(callback?: () => void) {
		for (const key of this._watchers.keys()) {
			this._deleteWatcher(key)
		}
		if (this._resolveUpdatesTimer) {
			clearTimeout(this._resolveUpdatesTimer)
			this._resolveUpdatesTimer = undefined
		}
		this.ready(() => {
			this._stats.clear()
			callback && callback()
		})
	}

	// #endregion

	// #region 更新

	/** 暂存所有已更新的文件或文件夹，确保短时间内不重复触发事件 */
	private _pendingUpdates = new Set<string>()

	/** 等待解析暂存的更改的计时器 */
	private _resolveUpdatesTimer?: ReturnType<typeof setTimeout>

	/** 获取或设置监听延时回调的毫秒数 */
	delay = 256

	/** 判断或设置是否仅当文件的最后修改时间发生变化才触发更新 */
	compareModifyTime = false

	/**
	 * 处理原生更改事件
	 * @param path 更改的文件或文件夹路径
	 */
	protected handleWatchChange(path: string) {
		if (this.ignored(path)) {
			return
		}
		this._pendingUpdates.add(path)
		if (this._resolveUpdatesTimer) {
			return
		}
		this._resolveUpdatesTimer = setTimeout(this._resolveUpdates, this.delay)
	}

	/** 解析所有已挂起的更改 */
	private _resolveUpdates = () => {
		this._resolveUpdatesTimer = undefined
		const pendingUpdates = this._pendingUpdates
		if (pendingUpdates.size > 1) {
			// 如果有多个文件更新，需要传入更新列表以避免重复更新
			for (const pendingChange of pendingUpdates) {
				const stats = this._stats.get(pendingChange)
				this._commitUpdate(pendingChange, stats === undefined ? pendingChange.includes(".") : typeof stats === "number", !this.compareModifyTime, pendingUpdates)
			}
			this._pendingUpdates = new Set()
		} else {
			// 如果只有一个文件更新，可复用 pendingUpdates 对象
			for (const pendingChange of pendingUpdates) {
				const stats = this._stats.get(pendingChange)
				this._commitUpdate(pendingChange, stats === undefined ? pendingChange.includes(".") : typeof stats === "number", !this.compareModifyTime)
			}
			pendingUpdates.clear()
		}
	}

	/**
	 * 更新指定文件或文件夹的状态
	 * @param path 要更新的文件或文件夹路径
	 * @param isFile 是否优先将路径作为文件处理
	 * @param force 是否强制更新文件
	 * @param pendingUpdates 本次同时更新的所有路径，提供此参数可避免重复更新
	 */
	private _commitUpdate(path: string, isFile: boolean, force: boolean, pendingUpdates?: Set<string>) {
		this._pending++
		if (isFile) {
			stat(path, (error, stats) => {
				if (error) {
					if (error.code === "ENOENT") {
						// * -> 不存在
						this._commitDelete(path, pendingUpdates)
					} else {
						this.onError(error, path)
					}
				} else if (stats.isFile()) {
					// * -> 文件
					const prevStats = this._stats.get(path)
					const newWriteTime = stats.mtimeMs
					if (typeof prevStats === "number") {
						// 文件 -> 文件
						if (force || prevStats !== newWriteTime) {
							this._stats.set(path, newWriteTime)
							this.onChange(path, stats, prevStats)
						}
					} else {
						// * -> 文件
						if (prevStats !== undefined) {
							this._commitDelete(path, pendingUpdates)
						}
						// 轮询需要将每个文件加入监听
						if (this.usePolling && this.isWatching && !this._watchers.has(path)) {
							this._createPollingWatcher(path, e => {
								if (e) {
									this.onError(e, path)
								}
							})
						}
						this._stats.set(path, newWriteTime)
						this.onCreate(path, stats)
					}
				} else if (stats.isDirectory()) {
					// * -> 文件夹
					this._commitUpdate(path, false, force, pendingUpdates)
				}
				if (--this._pending === 0) {
					this.emit("ready")
				}
			})
		} else {
			readdir(path, (error, entries) => {
				if (error) {
					if (error.code === "ENOENT") {
						// * -> 不存在
						this._commitDelete(path, pendingUpdates)
					} else if (error.code === "ENOTDIR" || error.code === "EEXIST") {
						// * -> 文件
						this._commitUpdate(path, true, force, pendingUpdates)
					} else if (error.code === "EMFILE" || error.code === "ENFILE") {
						this._pending++
						setTimeout(() => {
							this._commitUpdate(path, isFile, force, pendingUpdates)
							if (--this._pending === 0) {
								this.emit("ready")
							}
						}, this.delay)
					} else {
						this.onError(error, path)
					}
				} else {
					const prevStats = this._stats.get(path)
					if (typeof prevStats === "object") {
						this._stats.set(path, entries)
						// 查找删除的文件
						for (const entry of prevStats) {
							if (entries.includes(entry)) {
								continue
							}
							this._commitDelete(join(path, entry), pendingUpdates)
						}
						// 轮询模式需手动查找新增的文件
						if (this.usePolling) {
							for (const entry of entries) {
								if ((prevStats as string[]).includes(entry)) {
									continue
								}
								const child = join(path, entry)
								if (this.ignored(child)) {
									continue
								}
								this._commitUpdate(child, entry.includes(".", 1), false, pendingUpdates)
							}
						}
						// 其它情况无需处理文件夹的修改事件，如果文件被修改或新文件创建，将会触发相应文件的事件
					} else {
						// * -> 文件夹
						if (prevStats !== undefined) {
							this._commitDelete(path)
						}
						// 非递归模式需要将每个文件夹加入监听
						if (!this.watchOptions.recursive && this.isWatching && !this._watchers.has(path)) {
							this._createWatcher(path, e => {
								if (e) {
									this.onError(e, path)
								}
							})
						}
						this._stats.set(path, entries)
						this.onCreateDir(path, entries)
						for (const entry of entries) {
							const child = join(path, entry)
							if (this.ignored(child) || pendingUpdates && pendingUpdates.has(child)) {
								continue
							}
							const childStats = this._stats.get(child)
							this._commitUpdate(child, childStats !== undefined ? typeof childStats === "number" : entry.includes(".", 1), false, pendingUpdates)
						}
					}
				}
				if (--this._pending === 0) {
					this.emit("ready")
				}
			})
		}
	}

	/**
	 * 删除指定文件或文件夹
	 * @param path 要删除的文件或文件夹路径
	 * @param pendingUpdates 本次同时更新的所有路径，提供此参数可避免重复更新
	 */
	private _commitDelete(path: string, pendingUpdates?: Set<string>) {
		// 不处理未添加的路径
		const prevStats = this._stats.get(path)
		if (prevStats === undefined) {
			return
		}
		// 更新路径对应的监听器
		this._deleteWatcher(path)
		this._stats.delete(path)
		if (typeof prevStats === "number") {
			this.onDelete(path, prevStats)
		} else {
			for (const entry of prevStats as string[]) {
				const child = join(path, entry)
				if (pendingUpdates && pendingUpdates.has(child)) {
					continue
				}
				this._commitDelete(child, pendingUpdates)
			}
			this.onDeleteDir(path, prevStats as string[])
		}
	}

	/**
	 * 当监听到文件夹创建后执行
	 * @param path 相关的文件夹路径
	 * @param entries 文件夹内的文件列表
	 */
	protected onCreateDir(path: string, entries: string[]) { this.emit("createDir", path, entries) }

	/**
	 * 当监听到文件夹删除后执行
	 * @param path 相关的文件夹路径
	 * @param prevEntries 文件夹被删除前的文件列表
	 */
	protected onDeleteDir(path: string, prevEntries: string[]) { this.emit("deleteDir", path, prevEntries) }

	/**
	 * 当监听到文件创建后执行
	 * @param path 相关的文件路径
	 * @param stats 文件属性对象
	 */
	protected onCreate(path: string, stats: Stats) { this.emit("create", path, stats) }

	/**
	 * 当监听到文件修改后执行
	 * @param path 相关的文件路径
	 * @param stats 相关的文件属性对象
	 * @param prevWriteTime 文件的上一次修改时间戳
	 */
	protected onChange(path: string, stats: Stats, prevWriteTime: number) { this.emit("change", path, stats, prevWriteTime) }

	/**
	 * 当监听到文件删除后执行
	 * @param path 相关的文件路径
	 * @param prevWriteTime 文件被删除前最后一次的修改时间戳
	 */
	protected onDelete(path: string, prevWriteTime: number) { this.emit("delete", path, prevWriteTime) }

	/**
	 * 当监听发生错误后执行
	 * @param error 相关的错误对象
	 * @param path 原始监听的路径
	 */
	protected onError(error: NodeJS.ErrnoException, path: string) { this.emit("error", error, path) }

	// #endregion

}

/** 表示监听器的附加选项 */
export interface FileSystemWatcherOptions {
	/**
	 * 监听延时回调的毫秒数
	 * @description 设置一定的延时可以避免在短时间内重复处理相同的文件
	 * @default 2500
	 */
	delay?: number
	/**
	 * 是否在监听时阻止进程退出
	 * @default true
	 */
	persistent?: boolean
	/**
	 * 是否强制使用轮询监听，轮询监听可以支持更多的文件系统，但会占用大量 CPU
	 * @default process.platform !== "win32" && process.platform !== "darwin" && process.platform !== "linux" && process.platform !== "aix"
	 */
	usePolling?: boolean
	/**
	 * 轮询的间隔毫秒数
	 * @default 512
	 */
	interval?: number
	/**
	 * 判断是否忽略指定的路径
	 * @param path 要判断的文件或文件夹路径
	 */
	ignored?: (path: string) => boolean
}