import * as assert from "assert"
import * as webServer from "../../src/server/webServer"
import { request } from "../../src/utils/request"
import { init, uninit } from "../helpers/fsHelper"

export namespace webServerTest {

	export async function before() {
		await init({
			"main.js": `response.end("hello")`,
			"main.ejs": `<% await include("./include.ejs") %>`,
			"include.ejs": `<%response.write("hello")%> <%="world"%>`,
		})
	}

	export async function after() {
		await uninit()
	}

	export async function webServerTest() {
		const server = new webServer.WebServer({
			url: "http://127.0.0.1:0/haha",
			directoryList: true
		})
		server.unref()
		await server.start()
		await request({
			url: server.rootUrl,
			timeout: 300
		})
		await server.close()
	}

	export async function fileTest() {
		const server = new webServer.WebServer({
			url: "https://localhost:0/haha",
			directoryList: true,
			defaultPages: [
				"main.js"
			]
		})
		server.unref()
		await server.start()

		assert.strictEqual(await request({
			url: server.rootUrl + "/main.js",
			rejectUnauthorized: false,
			timeout: 300
		}), `response.end("hello")`)

		assert.strictEqual(await request({
			url: server.rootUrl,
			rejectUnauthorized: false,
			timeout: 300
		}), `response.end("hello")`)
		await server.close()
	}

	export async function directoryListTest() {
		const server = new webServer.WebServer({
			url: "https://localhost:0/haha",
			http2: true,
			directoryList: true
		})
		server.unref()
		await server.start()

		await request({
			url: server.rootUrl,
			rejectUnauthorized: false,
			timeout: 300,
		})
		await server.close()
	}

	export async function ejsTest() {
		const server = new webServer.WebServer({
			url: "http://127.0.0.1:0/haha",
			directoryList: true,
			routers: [
				{
					match: "*.ejs",
					async process(req, res, server) {
						await server.writeEJS(req, res, server.mapPath(req.path))
					}
				}
			]
		})
		server.unref()
		await server.start()

		assert.strictEqual(await request({
			url: server.rootUrl + "/main.ejs",
			timeout: 300
		}), "hello world")
		await server.close()
	}

	export async function serverJSTest() {
		const server = new webServer.WebServer({
			url: "http://127.0.0.1:0/haha",
			directoryList: true,
			routers: [
				{
					match: "*.js",
					async process(req, res, server) {
						res.contentType = "text/html"
						await server.writeServerJS(req, res, server.mapPath(req.path))
					}
				}
			]
		})
		server.unref()
		await server.start()

		assert.strictEqual(await request({
			url: server.rootUrl + "/main.js",
			timeout: 300
		}), "hello")
		await server.close()
	}

	export async function proxyTest() {
		const server = new webServer.WebServer({
			url: "http://127.0.0.1:0/haha",
			directoryList: true,
			routers: [
				{
					match: "/**",
					proxy: () => server2.rootUrl
				}
			]
		})
		server.unref()
		await server.start()

		const server2 = new webServer.WebServer({
			url: "0",
			routers: [
				{
					match: "/**",
					process(req, res) {
						res.contentType = "text/html"
						res.end("ok")
					}
				}
			]
		})
		server2.unref()
		await server2.start()

		assert.strictEqual(await request({
			url: server.rootUrl,
			timeout: 300
		}), "ok")
		await server.close()
	}

	export async function errorTest() {
		const server = new webServer.WebServer({
			url: "http://127.0.0.1:0/haha"
		})
		server.unref()
		await server.start()
		await assert.rejects(async () => await request({
			url: server.rootUrl.replace("/haha", ""),
			timeout: 300,
		}))
		await server.close()
	}

}