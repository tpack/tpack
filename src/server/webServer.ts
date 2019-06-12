import { readFileSync } from "fs"
import { STATUS_CODES } from "http"
import { AddressInfo } from "net"
import { join, resolve } from "path"
import { Server as TLSServer } from "tls"
import { parse } from "url"
import { FileSystem } from "../utils/fileSystem"
import { encodeHTML } from "../utils/html"
import { HTTPRequest, HTTPResponse, HTTPServer, HTTPServerOptions } from "../utils/httpServer"
import { Matcher, Pattern } from "../utils/matcher"
import { formatDate, formatSize, randomString } from "../utils/misc"
import { containsPath, getDir, getExt, getName } from "../utils/path"
import { open } from "../utils/process"
import { normalizeURL, resolveURL } from "../utils/url"
import { runInVM } from "../utils/vm"
import { getDefaultIcon, getDirIcon, getFileIcon } from "./icons"
import { getMimeType } from "./mimeTypes"

/** 表示一个 Web 服务器，提供静态文件、目录浏览、自定义路由等功能 */
export class WebServer extends HTTPServer {

	/**
	 * 初始化新的服务器
	 * @param options 附加选项
	 */
	constructor(options: WebServerOptions = {}) {
		super(getHTTPServerOptions(options))
		this.fs = options.fs || new FileSystem()
		this.rootDir = options.rootDir || process.cwd()
		this.open = options.open || false
		this.openURL = options.openURL || ""
		let url = options.url
		if (url != undefined) {
			if (typeof url === "string" && !/^\d+$/.test(url)) {
				if (!/^[^\/]*\/\//.test(url)) {
					url = "http://" + url
				}
				const { hostname, port, pathname } = parse(url, false, true)
				if (hostname) {
					this.hostname = hostname
				}
				if (port) {
					this.port = +port || 0
				}
				if (pathname) {
					this.rootPath = normalizeURL(pathname).replace(/\/$/, "")
				}
			} else {
				this.port = +url
			}
		}
		if (this.port == undefined) this.port = 8000 + hashCode(this.rootDir) % 1000
		this.headers = options.headers
		this.routers = options.routers ? options.routers.map(router => {
			const matcher = new Matcher(router.match || (() => true), undefined, true)
			if (router.exclude) {
				matcher.exclude(router.exclude)
			}
			let process = router.process
			if (!process) {
				const staticPath = router.static
				if (staticPath) {
					if (typeof staticPath === "string") {
						process = (request, response) => {
							this.writeStatic(request, response, this.formatURL(staticPath, request.path, matcher.base) + (request.search ? "?" + request.search : ""))
						}
					} else {
						process = (request, response, server) => {
							this.writeStatic(request, response, staticPath(request, response, server))
						}
					}
				} else {
					const rewrite = router.rewrite
					if (rewrite) {
						if (typeof rewrite === "string") {
							process = request => {
								request.path = this.formatURL(rewrite, request.path, matcher.base)
							}
						} else {
							process = (request, response, server) => {
								request.path = rewrite(request, response, server)
							}
						}
					} else {
						const proxy = router.proxy
						if (proxy) {
							if (typeof proxy === "string") {
								process = (request, response) => {
									this.writeProxy(request, response, this.formatURL(proxy, request.path, matcher.base) + (request.search ? "?" + request.search : ""))
								}
							} else {
								process = (request, response, server) => {
									this.writeProxy(request, response, proxy(request, response, server))
								}
							}
						} else {
							process = () => { }
						}
					}
				}
			}
			return {
				matcher: matcher,
				process: process,
				break: router.break !== undefined ? router.break : router.proxy || router.process || router.static ? true : false
			}
		}) : []
		this.mimeTypes = options.mimeTypes
		this.directoryList = !!options.directoryList
		this.defaultPages = options.defaultPages || (this.directoryList ? [] : ["index.html", "index.htm"])

		function getHTTPServerOptions(options: WebServerOptions) {
			// 如果是 HTTPS 但未提供证书，使用自带证书
			if (options.https || typeof options.url === "string" && /^https:/i.test(options.url)) {
				options = { https: true, ...options }
				if (!options.cert && !options.key) {
					options.cert = readFileSync(__dirname + "/data/cert/cert.pem")
					options.key = readFileSync(__dirname + "/data/cert/key.pem")
				}
			}
			return options
		}

		/** 快速计算字符串标识 */
		function hashCode(value: string) {
			let count = 0
			for (let i = 0; i < value.length; i++) {
				count += value.charCodeAt(i)
			}
			return count
		}

	}

	/**
	 * 替换设置的重写地址中的变量
	 * @param url 用户设置的地址
	 * @param path 请求路径
	 * @param baseDir 基路径
	 */
	protected formatURL(url: string, path: string, baseDir?: string | null) {
		return url.replace(/<(\w+)(?::(\d+))?>/g, (source, key, argument) => {
			switch (key) {
				case "path":
					return (baseDir && containsPath(baseDir, path, true) ? path.substring(baseDir.length) : path).replace(/^\//, "")
				case "dir":
					return getDir((baseDir && containsPath(baseDir, path, true) ? path.substring(baseDir.length) : path).replace(/^\//, ""))
				case "name":
					return getName(path, false)
				case "ext":
					return getExt(path)
				case "date":
					return argument ? new Date().toLocaleString() : formatDate(new Date(), argument)
				case "random":
					return randomString(+argument || 8)
			}
			return source
		})
	}

	/** 获取当前服务器的根地址，如果服务器未在监听则返回 `undefined` */
	get rootUrl() {
		const address = this.address() as AddressInfo | null
		if (!address) {
			return undefined
		}
		const https = this instanceof TLSServer
		const hostname = this.hostname || address.address
		const port = this.port || address.port
		return `${https ? "https:" : "http:"}//${hostname === "::" || hostname === "::1" || hostname === "0.0.0.0" ? "localhost" : address.family === "IPv6" ? `[${hostname}]` : hostname}${port === (https ? 443 : 80) ? "" : `:${port}`}${this.rootPath}`
	}

	/** 获取配置的服务器主机地址 */
	readonly hostname?: string

	/** 获取配置的服务器端口 */
	readonly port?: number

	/** 获取允许的最大连接数 */
	readonly backlog?: number

	/** 获取服务根地址 */
	readonly rootPath: string = ""

	/** 判断是否在启动时打开浏览器 */
	readonly open: boolean | string

	/** 获取启动时打开的地址 */
	readonly openURL: string

	/** 启动服务器 */
	start() {
		return new Promise<void>((resolve, reject) => {
			this.on("error", reject)
			this.listen(this.port, this.hostname, this.backlog, () => {
				this.off("error", reject)
				if (this.open) {
					open(resolveURL(this.rootUrl!, this.openURL), false, typeof this.open === "string" ? this.open : undefined)
				}
				resolve()
			})
		})
	}

	/**
	 * 关闭服务器
	 * @returns 如果服务器已成功关闭，返回 `true`，如果服务器未启动，返回 `false`
	 */
	close(): any {
		return new Promise<boolean>((resolve, reject) => {
			Object.getPrototypeOf(Object.getPrototypeOf(this)).close.call(this, (error: NodeJS.ErrnoException) => {
				if (error) {
					if (error.code === "ERR_SERVER_NOT_RUNNING") {
						resolve(false)
					} else {
						reject(error)
					}
				} else {
					resolve(true)
				}
			})
		})
	}

	/** 响应请求的路由规则 */
	readonly routers: {
		/** 匹配请求的匹配器 */
		matcher: Matcher
		/**
		 * 自定义处理请求
		 * @param request 当前的请求对象
		 * @param response 当前的响应对象
		 * @param server 当前的服务器对象
		 */
		process(request: HTTPRequest, response: HTTPResponse, server: WebServer): void | Promise<void>
		/** 是否终止后续路由 */
		break: boolean
	}[]

	/**
	 * 处理客户端请求
	 * @param request 当前的请求对象
	 * @param response 当前的响应对象
	 */
	async processRequest(request: HTTPRequest, response: HTTPResponse) {
		try {
			for (const router of this.routers) {
				if (router.matcher.test(request.path, request, response, this)) {
					await router.process(request, response, this)
					if (router.break) {
						return
					}
				}
			}
			await this.defaultRouter(request, response)
		} catch (e) {
			this.writeError(request, response, e)
		}
	}

	/** 获取当前服务器的根文件夹 */
	readonly rootDir: string

	/**
	 * 获取请求地址对应的本地物理地址，如果无法映射则返回空
	 * @param path 请求的地址
	 */
	mapPath(path: string) {
		if (this.rootPath) {
			if (path.toLowerCase().startsWith(this.rootPath.toLowerCase()) && (path.length === this.rootPath.length || path.charCodeAt(this.rootPath.length) === 47 /*/*/)) {
				path = path.substring(this.rootPath.length)
			} else {
				return null
			}
		}
		return join(this.rootDir, path)
	}

	/**
	 * 默认路由
	 * @param request 当前的请求对象
	 * @param response 当前的响应对象
	 */
	async defaultRouter(request: HTTPRequest, response: HTTPResponse) {
		const path = this.mapPath(request.path)
		if (path) {
			await this.writeStatic(request, response, path)
		} else {
			this.writeError(request, response, 404)
		}
	}

	/** 在每个请求中附加的请求头内容 */
	readonly headers?: { [name: string]: string }

	/** 获取使用的文件系统 */
	readonly fs: FileSystem

	/** 获取所有自定义扩展名（含点）到 MIME 类型的映射表 */
	readonly mimeTypes?: { [ext: string]: string | false }

	/** 判断是否自动列出文件 */
	readonly directoryList: boolean

	/** 获取默认首页 */
	readonly defaultPages: string[]

	/**
	 * 响应一个静态文件或文件夹
	 * @param request 当前的请求对象
	 * @param response 当前的响应对象
	 * @param path 本地文件或文件夹路径
	 */
	async writeStatic(request: HTTPRequest, response: HTTPResponse, path: string) {
		const stat = await this.fs.getStat(path)
		if (stat.isFile()) {
			this.writeFile(request, response, path, stat.mtimeMs)
		} else if (stat.isDirectory()) {
			if (!request.path.endsWith("/")) {
				response.writeHead(301, {
					Location: `${encodeURI(request.path)}/${request.search ? "?" + request.search : ""}`,
					...this.headers
				})
				response.end()
				return
			}
			const entries = await this.fs.readDir(path)
			for (const index of this.defaultPages) {
				if (entries.includes(index)) {
					const indexPath = join(path, index)
					const fileStat = await this.fs.getStat(indexPath)
					if (fileStat.isFile()) {
						this.writeFile(request, response, indexPath, fileStat.mtimeMs)
						return
					}
				}
			}
			if (this.directoryList) {
				this.writeDir(request, response, (await Promise.all(entries.map(async entry => {
					try {
						const stat = await this.fs.getStat(join(path, entry))
						return {
							name: entry,
							isDir: stat.isDirectory(),
							modified: stat.mtime,
							size: stat.size
						}
					} catch {
						return null!
					}
				}))).filter(entry => entry))
			} else {
				this.writeError(request, response, 403)
			}
		} else {
			this.writeError(request, response, 403)
		}
	}

	/**
	 * 响应一个文件
	 * @param request 当前的请求对象
	 * @param response 当前的响应对象
	 * @param path 文件或文件夹路径
	 * @param modified 文件最后修改戳
	 */
	writeFile(request: HTTPRequest, response: HTTPResponse, path: string, modified: number) {
		const ifNoneMatch = +request.headers["if-none-match"]!
		if (ifNoneMatch === modified) {
			response.writeHead(304, this.headers)
			response.end()
			return
		}
		const mimeType = getMimeType(path, this.mimeTypes as any) as string | false
		if (mimeType === false) {
			this.writeError(request, response, 403)
			return
		}
		const stream = this.fs.createReadStream(path)
		stream.on("error", error => {
			this.writeError(request, response, error.code === "ENOENT" ? 404 : error.code === "EACCESS" ? 403 : error)
		})
		stream.on("open", () => {
			response.writeHead(200, {
				'Content-Type': mimeType || "application/octet-stream",
				'ETag': modified,
				...this.headers
			})
		})
		stream.pipe(response)
	}

	/**
	 * 响应一个文件列表
	 * @param request 当前的请求对象
	 * @param response 当前的响应对象
	 * @param entries 所有文件夹和文件项
	 * @param entries[].name 文件夹或文件名
	 * @param entries[].dir 该项是否是文件夹
	 * @param entries[].modified 最后修改时间
	 * @param entries[].size 文件的大小
	 * @param entries[].title 文件的提示
	 * @param rootDir 是否是根目录
	 */
	writeDir(request: HTTPRequest, response: HTTPResponse, entries: { name: string, isDir?: boolean, modified?: Date, size?: number, title?: string }[], rootDir = request.path === "/") {
		entries.sort((x, y) => {
			if (x.isDir !== y.isDir) {
				return x.isDir ? -1 : 1
			}
			const name1 = x.name.toLowerCase()
			const name2 = y.name.toLowerCase()
			return name1 < name2 ? -1 : name1 > name2 ? 1 : 0
		})
		const now = new Date()
		let html = `<!DOCTYPE html>
<html>
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>${encodeHTML(request.path)}</title>
	<style>
		body {
			color: #333;
			margin: 1rem;
			font-size: .875rem;
			line-height: 1.5;
			font-family: Consolas, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif
		}

		h1 {
			font-size: 1.5rem;
			font-weight: 500;
			margin: .5rem 0;
			color: #666;
		}

		h1 svg {
			width: 1.5rem;
			height: 1.5rem;
			vertical-align: -4px;
		}

		ul {
			list-style: none;
			margin: 0;
			padding: 0;
		}

		a {
			color: #23527c;
			text-decoration: none;
		}

		a:hover {
			color: #23527c;
		}

		h1 a:hover {
			text-decoration: underline;
		}

		ul a {
			display: block;
			padding: .5rem 1rem;
		}

		ul a:hover {
			background-color: #eee;
			border-radius: .25rem;
			transition: background-color .1s;
		}

		ul a:active {
			background-color: #ebebeb;
		}

		a:visited {
			color: #56237c;
		}

		svg {
			width: 1.25rem;
			height: 1.25rem;
			line-height: 1;
			vertical-align: middle;
			margin-right: .6rem;
		}

		.time {
			float: right;
			padding: 0 1rem;
			width: 12rem;
			color: #999;
		}

		.size {
			float: right;
			text-align: right;
			width: 8rem;
			color: #999;
		}

		@media screen and (max-width: 750px) {
			.time {
				display: none;
			}
			.size {
				display: none;
			}
		}
	</style>
</head>
<body>
	<h1><a href="/">${getDefaultIcon("home")}</a>${request.path.split("/").map((part, index, array) => part ? `<a href="${"../".repeat(Math.max(array.length - index - 2, 0))}">${encodeHTML(part)}</a>` : "").join("/")}</h1>
	<ul>
		<li>${rootDir ? "" : `<a href="../">${getDefaultIcon("back")}../</a>`}</li>
		${entries.map(entry => `<li><a title="${entry.title || entry.name}" href="${encodeHTML(entry.name)}${entry.isDir ? "/" : ""}"><span class="size">${entry.size ? formatSize(entry.size) : "&nbsp;"}</span><span class="time" title="${entry.modified ? entry.modified.toLocaleString() : ""}">${entry.modified ? this.formatDate(entry.modified, now) : ""}</span>${entry.isDir ? getDirIcon(entry.name) : getFileIcon(entry.name)}${encodeHTML(entry.name)}${entry.isDir ? "/" : ""}</a></li>`).join("\n")}
	</ul>
</body>
</html>`
		response.writeHead(200, {
			'Content-Type': "text/html",
			...this.headers
		})
		response.end(html)
	}

	/**
	 * 格式化时间为可读格式
	 * @param date 要格式化的时间
	 * @param now 服务器的当前时间
	 */
	protected formatDate(date: Date, now: Date) {
		const span = now.getTime() - date.getTime()
		if (span < 0) {
			return date.toLocaleString()
		}
		if (span < 2000) {
			return "just now"
		}
		if (span < 60000) {
			return `${Math.round(span / 1000)} seconds ago`
		}
		if (span < 60000 * 60) {
			return `${Math.round(span / 60000)} minutes ago`
		}
		if (now.getFullYear() - date.getFullYear()) {
			return date.toLocaleDateString()
		}
		if (date.getMonth() !== now.getMonth()) {
			return date.toLocaleDateString().replace(new RegExp(`\\D?${date.getFullYear()}\\D?`), "")
		}
		const dayOffset = now.getDate() - date.getDate()
		if (dayOffset !== 0) {
			if (dayOffset === 1) {
				return "yesterday"
			}
			return `${dayOffset} days ago`
		}
		return `${Math.round(span / (60000 * 60))} hours ago`
	}

	/**
	 * 响应一个静态数据
	 * @param request 当前的请求对象
	 * @param response 当前的响应对象
	 * @param content 要响应的内容
	 * @param mimeType 要响应的 MIME 类型
	 * @param etag 缓存内容的标签，如果客户端传递了相同的标签则使用客户端缓存
	 */
	writeContent(request: HTTPRequest, response: HTTPResponse, content: string | Buffer, mimeType: string, etag?: string) {
		const ifNoneMatch = request.headers["if-none-match"]!
		if (ifNoneMatch === etag) {
			response.writeHead(304, this.headers)
			response.end()
			return
		}
		response.writeHead(200, etag ? {
			"Content-Type": mimeType,
			"ETag": etag,
			...this.headers
		} : {
				"Content-Type": mimeType,
				...this.headers
			})
		response.end(content)
	}

	/**
	 * 响应一个服务端 JS
	 * @param request 当前的请求对象
	 * @param response 当前的响应对象
	 * @param path 要执行的 JS 代码路径
	 * @param context 代码中可使用的全局变量
	 */
	async writeServerJS(request: HTTPRequest, response: HTTPResponse, path: string, context?: { [key: string]: any }) {
		const code = await this.fs.readText(path)
		runInVM(code, {
			request,
			response,
			server: this,
			...context
		}, path)
	}

	/**
	 * 响应一个 EJS 模板（仅支持 `<% %>`、`<%= %>` 和 `<%# %>` 语法）
	 * @param request 当前的请求对象
	 * @param response 当前的响应对象
	 * @param path 要响应的错误或 HTTP 错误码
	 * @param context 模板中可使用的全局变量
	 * @param end 是否结束请求
	 */
	async writeEJS(request: HTTPRequest, response: HTTPResponse, path: string, context?: { [key: string]: any }, end = true) {
		const code = await this.fs.readText(path)
		let compiled = "(async function () { var __output__; "
		let lastIndex = 0
		code.replace(/<%(#?)(=?)(.*?)%>/sg, (source, comment: string | undefined, equal: string | undefined, text: string, index: number) => {
			if (comment) {
				return ""
			}
			compiled += plainText(code.substring(lastIndex, index))
			compiled += equal ? `;__output__ = ${text};if (__output__ != null){ response.write(String(__output__)); }` : text
			lastIndex = index + source.length
			return ""
		})
		compiled += plainText(code.substring(lastIndex))
		compiled += `})()`
		if (!response.headersSent) {
			response.contentType = "text/html"
		}
		await runInVM(compiled, {
			request,
			response,
			server: this,
			include: async (ejs: string, context: { [key: string]: any }) => {
				await this.writeEJS(request, response, resolve(path, "..", ejs), context, false)
			},
			...context
		}, path)
		if (end) {
			response.end()
		}

		function plainText(text: string) {
			return text ? `;response.write(\`${text.replace(/[`$\\]/g, "\\$&")}\`);` : ""
		}
	}

	/**
	 * 响应一个代理服务器
	 * @param request 当前的请求对象
	 * @param response 当前的响应对象
	 * @param url 实际请求的地址
	 */
	writeProxy(request: HTTPRequest, response: HTTPResponse, url: string) {
		const options = parse(url) as import("https").RequestOptions
		options.headers = {
			...request.headers,
			host: options.host
		}
		const proxyRequest = (require(options.protocol === "https:" ? "https" : "http") as typeof import("https")).request(options, (proxyResponse) => {
			proxyResponse.on("data", chunk => {
				response.write(chunk)
			});
			proxyResponse.on("end", () => {
				response.end()
			});
			response.writeHead(proxyResponse.statusCode!, proxyResponse.headers)
		})
		proxyRequest.on("error", () => {
			this.writeError(request, response, 502)
		})
		if (request.body) {
			proxyRequest.write(request.body)
		}
		proxyRequest.end()
	}

	/**
	 * 响应一个错误
	 * @param request 当前的请求对象
	 * @param response 当前的响应对象
	 * @param error 要响应的错误或 HTTP 错误码
	 */
	writeError(request: HTTPRequest, response: HTTPResponse, error: NodeJS.ErrnoException | number) {
		const statusCode = typeof error === "number" ? error : error.code === "ENOENT" ? 404 : error.code === "EACCESS" || error.code === "EPERM" ? 403 : 500
		const text = `<h1>${statusCode} <small>${STATUS_CODES[statusCode]}</small></h1><pre>${statusCode === 404 ? `Cannot find ${encodeHTML(request.path)}` : statusCode === 403 ? `Cannot access ${encodeHTML(request.path)}` : encodeHTML(error instanceof Error ? error.stack || error.toString() : error.toString())}</pre>`
		if (response.headersSent) {
			response.end(text)
			return
		}
		response.writeHead(statusCode, {
			"Content-Type": "text/html",
			...this.headers
		})
		response.end(`<!DOCTYPE html>
<html>
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>${statusCode} - ${STATUS_CODES[statusCode]}</title>
	<style>
		body {
			color: #333;
			margin: 1rem;
			font-size: .875rem;
			line-height: 1.5;
			font-family: Consolas, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif
		}

		h1 {
			font-size: 2rem;
			font-weight: 500;
			margin: .5rem 0;
			color: #333;
		}

		small {
			font-size: 1.25rem;
		}

		pre {
			font-family: inherit;
			color: #666;
		}
	</style>
</head>
<body>
	${text}
</body>
</html>`)
	}

}

/** 表示 Web 服务器的附加选项 */
export interface WebServerOptions extends HTTPServerOptions {
	/** 服务器的根地址或端口 */
	url?: string | number
	/** 是否在首次启动时打开浏览器 */
	open?: boolean | string
	/** 首次启动时打开的地址 */
	openURL?: string
	/** 附加的响应头内容 */
	headers?: { [name: string]: string }
	/** 响应请求的路由规则 */
	routers?: Router[]
	/**
	 * 当前服务器的根目录
	 * @default process.cwd()
	 */
	rootDir?: string
	/**
	 * 是否自动列出文件
	 * @default false
	 */
	directoryList?: boolean
	/**
	 * 默认首页
	 * @default this.directoryList ? ["index.html", "index.htm"] : []
	 */
	defaultPages?: string[]
	/** 所有自定义扩展名（含点）到 MIME 类型的映射表 */
	mimeTypes?: { [ext: string]: string | false }
	/** 使用的文件系统 */
	fs?: FileSystem
}

/** 表示一个服务器路由 */
export interface Router {
	/** 指定哪些请求可以使用此路由，可以是通配符或正则表达式等 */
	match?: Pattern
	/** 指定额外排除的请求，可以是通配符或正则表达式等 */
	exclude?: Pattern
	/**
	 * 重写请求的地址，如果是字符串，则其中以下标记会被替换：
	 * - `<path>`: 请求的路径，等价于 `<dir>/<name><ext>`
	 * - `<dir>`: 请求的文件夹路径
	 * - `<name>`: 请求的文件名（不含文件夹和扩展名部分）
	 * - `<ext>`: 请求的扩展名（含点）
	 * - `<date>`: 当前时间，默认为用户本地可读格式，如果要自定义格式，使用如 `<date:yyyyMMdd>`
	 * - `<random>`: 随机整数，默认为 8 位，如果要自定义为 n 位，使用如 `<rand:n>`
	 * @param request 当前的请求对象
	 * @param response 当前的响应对象
	 * @param server 当前的服务器对象
	 */
	rewrite?: string | ((request: HTTPRequest, response: HTTPResponse, server: WebServer) => string)
	/**
	 * 响应静态文件，如果是字符串，则其中以下标记会被替换：
	 * - `<path>`: 请求的路径，等价于 `<dir>/<name><ext>`
	 * - `<dir>`: 请求的文件夹路径
	 * - `<name>`: 请求的文件名（不含文件夹和扩展名部分）
	 * - `<ext>`: 请求的扩展名（含点）
	 * - `<date>`: 当前时间，默认为用户本地可读格式，如果要自定义格式，使用如 `<date:yyyyMMdd>`
	 * - `<random>`: 随机整数，默认为 8 位，如果要自定义为 n 位，使用如 `<rand:n>`
	 * @param request 当前的请求对象
	 * @param response 当前的响应对象
	 * @param server 当前的服务器对象
	 */
	static?: string | ((request: HTTPRequest, response: HTTPResponse, server: WebServer) => string)
	/**
	 * 代理的请求地址，如果是字符串，则其中以下标记会被替换：
	 * - `<path>`: 请求的路径，等价于 `<dir>/<name><ext>`
	 * - `<dir>`: 请求的文件夹路径
	 * - `<name>`: 请求的文件名（不含文件夹和扩展名部分）
	 * - `<ext>`: 请求的扩展名（含点）
	 * - `<date>`: 当前时间，默认为用户本地可读格式，如果要自定义格式，使用如 `<date:yyyyMMdd>`
	 * - `<random>`: 随机整数，默认为 8 位，如果要自定义为 n 位，使用如 `<rand:n>`
	 * @param request 当前的请求对象
	 * @param response 当前的响应对象
	 * @param server 当前的服务器对象
	 */
	proxy?: string | ((request: HTTPRequest, response: HTTPResponse, server: WebServer) => string)
	/**
	 * 自定义处理请求
	 * @param request 当前的请求对象
	 * @param response 当前的响应对象
	 * @param server 当前的服务器对象
	 */
	process?(request: HTTPRequest, response: HTTPResponse, server: WebServer): void
	/** 是否终止后续路由 */
	break?: boolean
}