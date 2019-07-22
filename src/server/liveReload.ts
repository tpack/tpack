import { readFileSync, statSync } from "fs"
import { IncomingMessage, Server as HTTPServer, ServerResponse } from "http"
import { Server as HTTPSServer } from "https"
import { UrlObject } from "url"
import { FileSystemWatcher, FileSystemWatcherOptions } from "../utils/fileSystemWatcher"
import { WebSocket, WebSocketServer, WebSocketServerOptions } from "../utils/webSocket"

/** 表示一个实时刷新服务器 */
export class LiveReloadServer extends WebSocketServer {

	/** 实时刷新协议的版本 */
	readonly version: number

	/** 是否启用 CSS 实时刷新 */
	readonly liveCSS: boolean

	/** 是否启用图片实时刷新 */
	readonly liveImage: boolean

	/** 所有请求路径对应的原始路径 */
	readonly originalPath: string

	/** 指定浏览器的地址 */
	readonly overrideURL: string

	/** 实时刷新的客户端脚本内容 */
	private _liveReloadScriptContent?: string

	/** 实时刷新的客户端脚本最后修改时间 */
	private _liveReloadScriptModified?: number

	/**
	 * 初始化新的服务器
	 * @param options 附加选项
	 */
	constructor(options: LiveReloadServerOptions = {}) {
		super(options.server || options.url || `http://localhost:${options.port || 35729}/livereload`, options)
		this.version = options.version || 7
		this.liveCSS = options.liveCSS !== false
		this.liveImage = options.liveImage !== false
		this.originalPath = options.originalPath || ""
		this.overrideURL = options.overrideURL || ""
		if (!this.existingServer) {
			this.server.removeAllListeners("request")
			this.server.on("request", (req: IncomingMessage, res: ServerResponse) => {
				if (req.url!.replace(/\?.*$/, "") === "/livereload.js") {
					if (this._liveReloadScriptContent === undefined) {
						this._liveReloadScriptContent = readFileSync(`${__dirname}/data/livereload.js`, "utf-8")
						this._liveReloadScriptModified = statSync(`${__dirname}/data/livereload.js`).mtimeMs
					}
					const ifModified = req.headers["if-modified-since"]
					if (ifModified !== undefined && new Date(ifModified).getTime() === this._liveReloadScriptModified) {
						res.writeHead(304, {
							"Access-Control-Allow-Origin": "*"
						})
						return res.end()
					}
					res.writeHead(200, {
						"Content-Type": "text/javascript",
						"Access-Control-Allow-Origin": "*",
						"Last-Modified": new Date(this._liveReloadScriptModified!).toUTCString()
					})
					return res.end(this._liveReloadScriptContent)
				}
				res.writeHead(404)
				return res.end()
			})
		}
	}

	get url() {
		const url = super.url
		return url ? url.replace(/^ws/, "http") : url
	}

	/** 获取注入到 HTML 页面的 JS 脚本地址 */
	get scriptURL() {
		return `${this.url || "http://localhost:35729"}/livereload.js`
	}

	/** 获取注入到 HTML 页面的 `<script>` 代码 */
	get script() {
		return `<script>document.write('<script src="${this.isSecure ? "https:" : "http:"}//' + location.host.split(':')[0] + ':${(this.address() || { port: 35729 }).port}/livereload.js"></' + 'script>')</script>`
	}

	/**
	 * 当有新的客户端连接时执行
	 * @param ws 用于和客户端通信的 WebSocket 对象
	 */
	protected onConnection(ws: WebSocket) {
		super.onConnection(ws)
		ws.on("message", (message: any) => {
			try {
				message = JSON.parse(message)
			} catch {
				return
			}
			this.onCommand(message, ws)
		})
	}

	/**
	 * 当接收到客户端发送的命令后执行
	 * @param data 用户发送的数据 
	 * @param ws 当前的 WebSocket 对象
	 */
	protected onCommand(data: { [key: string]: any }, ws: WebSocket) {
		if (data.command === "hello") {
			return ws.send(JSON.stringify({
				command: "hello",
				protocols: ["http://livereload.com/protocols/official-7", "http://livereload.com/protocols/official-8", "http://livereload.com/protocols/official-9", "http://livereload.com/protocols/2.x-origin-version-negotiation", "http://livereload.com/protocols/2.x-remote-control"],
				serverName: this.constructor.name
			}))
		}
		this.emit("command", data, ws)
	}

	/**
	 * 刷新所有客户端
	 * @param path 被更新的文件路径
	 */
	reload(path: string) {
		this.sendCommand("reload", {
			path: path,
			liveCSS: this.liveCSS,
			liveImg: this.liveImage,
			originalPath: this.originalPath,
			overrideURL: this.overrideURL
		})
	}

	/**
	 * 向所有客户端发送弹窗指令
	 * @param message 弹窗提示的内容
	 */
	alert(message: string) {
		this.sendCommand("alert", { message })
	}

	/**
	 * 向所有客户端发送一个指令
	 * @param command 要执行的指令
	 * @param data 附加的参数
	 */
	sendCommand(command: string, data: any) {
		this.send(JSON.stringify({
			command: command,
			...data
		}))
	}

	/** 关闭当前服务器 */
	async close() {
		if (this.watcher) {
			await new Promise(resolve => this.watcher!.close(resolve))
		}
		return await super.close()
	}

	/** 正使用的文件监听器 */
	watcher?: FileSystemWatcher

	/**
	 * 监听指定的目录并自动刷新
	 * @param dir 要监听的文件夹
	 * @param options 附加选项
	 */
	watch(dir: string, options?: FileSystemWatcherOptions) {
		if (this.watcher) {
			this.watcher.add(dir)
			return this.watcher
		}
		const { FileSystemWatcher } = require("../utils/fileSystemWatcher") as typeof import("../utils/fileSystemWatcher")
		const watcher = new FileSystemWatcher(options)
		watcher.add(dir)
		watcher.on("create", (path: string) => {
			this.reload(path)
		})
		watcher.on("change", (path: string) => {
			this.reload(path)
		})
		watcher.on("delete", (path: string) => {
			this.reload(path)
		})
		return this.watcher = watcher
	}
}

/** 表示实时刷新服务器的附加选项 */
export interface LiveReloadServerOptions extends WebSocketServerOptions {
	/**
	 * 实时刷新协议的版本
	 * @default 7
	 */
	version?: number
	/**
	 * 服务端的监听地址
	 * @default "http://localhost:35729"
	 */
	url?: string | UrlObject | URL
	/** 服务器的监听端口 */
	port?: number | string
	/** 已存在的服务器 */
	server?: HTTPServer | HTTPSServer
	/**
	 * 是否启用 CSS 实时刷新
	 * @default true
	 */
	liveCSS?: boolean
	/**
	 * 是否启用图片实时刷新
	 * @default true
	 */
	liveImage?: boolean
	/** 所有请求路径对应的原始路径 */
	originalPath?: string
	/** 指定浏览器的地址 */
	overrideURL?: string
}