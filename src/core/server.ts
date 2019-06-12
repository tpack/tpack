import { WebServer, WebServerOptions } from "../server/webServer"
import { HTTPRequest, HTTPResponse } from "../utils/httpServer"
import { containsPath, getDir, getName } from "../utils/path"
import { Builder } from "./builder"
import { i18n } from "./i18n"
import { VFile } from "./vfile"

/** 表示一个开发服务器 */
export class Server extends WebServer {

	// #region 选项

	/** 获取所属的构建器 */
	readonly builder: Builder

	/**
	 * 初始化新的开发服务器
	 * @param builder 所属的构建器
	 * @param options 服务器的附加选项
	 */
	constructor(builder: Builder, options: ServerOptions = {}) {
		super({ mimeTypes: builder.mimeTypes, ...options })
		this.builder = builder
		// @ts-ignore
		this.directoryList = options.directoryList !== false
	}

	/** 启动服务器 */
	async start() {
		try {
			await super.start()
			this.builder.logger.info(i18n`Server running at ${this.rootUrl}`, true)
		} catch (e) {
			if (e.code === "EADDRINUSE") {
				this.builder.logger.fatal(i18n`Cannot start server: Port ${e.port} is used by other program`)
			} else {
				this.builder.logger.fatal(i18n`Cannot start server: ${e.stack}`)
			}
		}
	}

	/** 关闭服务器 */
	async close() {
		await super.close()
		this.builder.logger.info(i18n`Server stopped`, true)
	}

	// #endregion

	// #region 请求

	/**
	 * 默认路由
	 * @param request 当前的请求对象
	 * @param response 当前的响应对象
	 */
	async defaultRouter(request: HTTPRequest, response: HTTPResponse) {
		// 执行自定义文件
		// 如果在用户请求一个文件时，该文件被更新，我们希望获取到该文件的最新版本
		// 技术上可以做到只等待当前文件生成，忽略其它文件
		// 假设一个页面引用了 2 个文件，第 1 个已生成，第 2 个文件正在生成
		// 如果此时 2 个文件都被修改，可能导致这个页面引了第 1 个文件的老版本和第 2 个文件的新版本
		// 为避免这个情况，只要任意文件正在构建，都延迟响应
		// 这个策略可能会降低某些情况的性能，但提高了服务器的稳定性
		const path = request.path.replace(/^\//, "")
		if (await this.builder.watcher!.buildQueue.then(() => {
			const file = this.builder.emittedFiles.get(path)
			if (file) {
				this.writeVFile(request, response, file)
				return file
			}
		})) {
			return
		}
		const entries = await this.readDir(path)
		if (entries.length > 0) {
			if (this.directoryList) {
				this.writeDir(request, response, entries)
			} else {
				this.writeError(request, response, 403)
			}
			return
		}
		this.writeError(request, response, 404)
	}

	/**
	 * 响应一个文件
	 * @param request 当前的请求对象
	 * @param response 当前的响应对象
	 * @param file 要响应的文件
	 */
	writeVFile(request: HTTPRequest, response: HTTPResponse, file: VFile) {
		const ifNoneMatch = request.headers["if-none-match"]!
		if (ifNoneMatch === file.hash) {
			response.writeHead(304, this.headers)
			return response.end()
		}
		file.type = file.type || this.builder.getMimeType(file.path)
		if (file.data === undefined) {
			const stream = this.builder.fs.createReadStream(file.originalPath)
			stream.on("open", () => {
				response.writeHead(200, {
					"Content-Type": file.type,
					"ETag": file.hash,
					...this.headers
				})
			})
			stream.on("error", error => {
				this.writeError(request, response, error)
			})
			stream.pipe(response)
		} else {
			response.writeHead(200, {
				"Content-Type": file.type,
				"ETag": file.hash,
				...this.headers
			})
			response.end(file.data)
		}
	}

	/**
	 * 读取文件夹信息
	 * @param path 要读取的文件夹路径（相对于根路径）
	 */
	async readDir(path: string) {
		path = path.replace(/\/$/, "")
		const entries: Promise<{ name: string, isDir?: boolean, modified?: Date, size?: number, title?: string }>[] = []
		const dirs = new Set<string>()
		for (const [filePath, file] of this.builder.emittedFiles) {
			if (containsPath(path, filePath, false)) {
				if (getDir(filePath) === path) {
					const originalPath = file.originalFile.originalPath
					if (originalPath) {
						entries.push(this.fs.getStat(originalPath).then(stats => ({
							name: getName(file.path),
							isDir: false,
							modified: stats.mtime,
							size: file.data === undefined ? stats.size : file.size,
							title: i18n`Generated from ${this.builder.relativePath(originalPath)}`
						}), () => ({
							name: getName(file.path),
							isDir: false,
							size: file.data === undefined ? undefined : file.size,
							title: i18n`Generated from ${this.builder.relativePath(originalPath)}`
						})))
					} else {
						entries.push({
							name: getName(file.path),
							isDir: false,
							title: i18n`Generated`
						} as any)
					}
				} else {
					const dir = filePath.substring(path.length).replace(/^\//, "").replace(/\/.*$/, "")
					if (!dirs.has(dir)) {
						dirs.add(dir)
						entries.push(this.fs.getStat(this.builder.resolvePath(`${path || "."}/${dir}`)).then(stats => ({
							name: dir,
							isDir: true,
							modified: stats.mtime
						}), () => ({
							name: dir,
							isDir: true
						})))
					}
				}
			}
		}
		return await Promise.all(entries)
	}

	// #endregion

}

/** 表示开发服务器的选项 */
export interface ServerOptions extends WebServerOptions {
	/**
	 * 设置是否在文件修改后自动刷新页面
	 * @default true
	 */
	autoReload?: boolean
	/**
	 * 设置是否启用模块热替换
	 * @default true
	 */
	hotReload?: boolean
}