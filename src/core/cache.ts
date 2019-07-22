import { md5 } from "../utils/crypto"
import { Builder } from "./builder"
import { Module } from "./module"

/** 表示一个缓存管理器 */
export class CacheManager {

	/** 获取当前的构建器 */
	readonly builder: Builder

	/** 获取缓存文件路径 */
	readonly path: string

	/** 获取缓存监听的文件列表，当任一监听的文件发生改变后缓存将失效 */
	readonly watch: string[]

	/** 判断或设置是否检测文件内容以确认缓存是否有效，如果为 `false` 则只根据文件大小和最后修改时间判断 */
	readonly checkContent: boolean

	/**
	 * 初始化新的缓存管理器
	 * @param options 附加选项
	 * @param builder 当前的构建器
	 */
	constructor(builder: Builder, options: CacheOptions = {}) {
		this.builder = builder
		this.path = options.path || "node_modules/.cache/tpack-build.json"
		this.watch = options.watch || ["node_modules", "package.json", "package-lock.json"]
		this.checkContent = options.checkContent || false
	}

	/**
	 * 读取缓存
	 * @returns 如果读取成功则返回 `true`，否则说明缓存已失效，返回 `false`
	 */
	async loadCache() {
		//  todo
		return
		const cacheData = JSON.parse(await this.builder.fs.readFile(this.path, "utf-8")) as CacheData
		// 检验缓存
		if (cacheData.version !== this.builder.version) {
			return false
		}
		if (cacheData.checkContent !== this.checkContent) {
			return false
		}
		for (const key in cacheData.watch) {
			if (await this.getHash(this.builder.resolvePath(key)) !== cacheData.watch[key]) {
				return false
			}
		}
		// 载入缓存
		const promises: Promise<boolean>[] = []
		for (const key in cacheData.files) {
			promises.push(this._loadFileFromCache(this.builder.resolvePath(key), cacheData.files[key]))
		}
		await Promise.all(promises)
		return true
	}

	/**
	 * 尝试从缓存读取文件对象
	 * @param file 要载入的目标文件
	 * @param cache 要载入的缓存
	 */
	private async _loadFileFromCache(path: string, cache: CacheData["files"][""]) {
		const hash = await this.getHash(path, true)
		const file = this.builder.getModule(path)
		if (hash !== cache.hash) {
			return false
		}
		// todo 从缓存读取数据
		this._deserializeFile(cache, file)
		return true
	}

	private _deserializeFile(cache: CacheData["files"][""], file: Module) {
	}

	private _serializeFile(file: Module, cache: CacheData["files"][""]) {

	}

	/**
	 * 保存缓存
	 */
	async saveCache() {
		//  todo
		return
		const cacheData: CacheData = {
			version: this.builder.version,
			checkContent: this.checkContent,
			created: new Date().toISOString(),
			watch: {},
			files: {}
		}
		for (const path of this.watch) {
			cacheData.watch[this.builder.relativePath(path)] = await this.getHash(path)
		}
		for (const [key, file] of this.builder.modules.entries()) {
			const cache = cacheData.files[this.builder.relativePath(key)] = {
				hash: await this.getHash(key)
				// todo 写入数据
			}
			this._serializeFile(file, cache)
		}
		await this.builder.fs.writeFile(this.path, JSON.stringify(cacheData))
	}

	/**
	 * 读取文件或文件夹的哈希值，当哈希值发生变化意味着文件或文件夹内容发生变化
	 * @param path 要读取的路径
	 * @param saveData 是否缓存计算过程中用到的数据
	 */
	async getHash(path: string, saveData?: boolean) {
		if (this.checkContent) {
			try {
				const buffer = await this.builder.fs.readFile(path)
				if (saveData) {
					this.builder.getModule(path).data = buffer
				}
				return md5(buffer)
			} catch (e) {
				if (e.code === "ENOENT") {
					return null
				}
				// 文件夹仍然使用最后修改时间作为哈希值
				if (e.code !== "EISDIR") {
					throw e
				}
			}
		}
		try {
			const stats = await this.builder.fs.getStat(path)
			return `${stats.mtimeMs.toString(36)}-${stats.size.toString(36)}`
		} catch (e) {
			if (e.code === "ENOENT") {
				return null
			}
			throw e
		}
	}

}

/** 表示缓存的选项 */
export interface CacheOptions {
	/**
	 * 缓存文件路径
	 * @default "node_modules/.cache/tpack-build.json"
	 */
	path?: string
	/**
	 * 缓存监听的文件列表，当任一监听的文件发生改变后缓存将失效
	 * @default ["node_modules", "package.json", "package-lock.json"]
	 */
	watch?: string[]
	/**
	 * 是否检测文件内容以确认缓存是否有效，如果为 `false` 则只根据文件大小和最后修改时间判断
	 * @default false
	 */
	checkContent?: boolean
}

/** 表示一个缓存数据 */
interface CacheData {
	/** 构建器的版本号 */
	version: string
	/** 缓存的生成时间 */
	created: string
	/** 是否检测文件内容以确认缓存是否有效 */
	checkContent: boolean
	/** 监听文件的哈希值 */
	watch: { [key: string]: string | null }
	/** 所有文件的构建状态 */
	files: {
		[key: string]: {
			/** 文件的哈希值 */
			hash: string | null
		}
	}
}