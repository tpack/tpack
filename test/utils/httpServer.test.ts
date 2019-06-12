import * as assert from "assert"
import { brotliCompressSync, deflateSync, gzipSync } from "zlib"
import * as httpServer from "../../src/utils/httpServer"
import { CookieJar, request } from "../../src/utils/request"

export namespace httpServerTest {

	export async function basicTest() {
		const server = new httpServer.HTTPServer(undefined, (req, res) => {
			res.end("Hello")
		})
		server.unref()
		server.listen(0)
		assert.strictEqual((await request(server.rootUrl)).toString(), "Hello")
		server.close()
	}

	export async function getTest() {
		const server = new httpServer.HTTPServer(undefined, (req, res) => {
			assert.strictEqual(req.query.q1, "x")
			assert.strictEqual(req.query.q2, "y")
			assert.strictEqual(req.body, undefined)
			assert.strictEqual(req.text, undefined)
			assert.strictEqual(req.json, undefined)
			assert.strictEqual(req.forms, undefined)
			res.end("Hello")
		})
		server.unref()
		server.listen(0)
		assert.strictEqual((await request({ url: server.rootUrl + "?q1=x", userAgent: null, method: "GET", data: { q2: "y" } })).toString(), "Hello")
		assert.strictEqual((await request({ url: server.rootUrl, userAgent: null, method: "GET", data: { q2: "y", q1: "x" } })).toString(), "Hello")
		server.close()
	}

	export async function postTest() {
		const server = new httpServer.HTTPServer(undefined, (req, res) => {
			assert.strictEqual(req.method, "POST")
			assert.strictEqual(req.path, "/path")
			assert.strictEqual(req.search, "q1=v1")
			assert.strictEqual(req.isLocal, true)
			assert.strictEqual(req.remoteAddress, req.localAddress)
			assert.strictEqual(req.ip, req.remoteAddress)
			assert.ok(req.remotePort > 0)
			assert.ok(req.localPort > 0)
			assert.strictEqual(req.isSecure, false)
			assert.strictEqual(req.protocol, "http:")
			assert.strictEqual(req.host, `localhost:${req.localPort}`)
			assert.strictEqual(req.href, `http://localhost:${req.localPort}/path?q1=v1`)
			assert.strictEqual(req.certificate, undefined)
			assert.deepStrictEqual(req.acceptLanguages, [{ value: "zh-cn", quality: 1 }, { value: "zh", quality: 0.5 }])
			assert.strictEqual(req.referer, undefined)
			assert.strictEqual(req.ifModifiedSince, undefined)
			assert.deepStrictEqual(req.acceptTypes, [])
			assert.deepStrictEqual(req.acceptCharsets, [])
			assert.ok(req.userAgent)
			assert.ok(req.totalBytes > 0)
			assert.ok(req.contentLength > 0)
			assert.strictEqual(req.cookies.c1, undefined)
			assert.strictEqual(req.contentType, "application/x-www-form-urlencoded")
			assert.strictEqual(req.query.q1, "v1")
			assert.strictEqual(req.forms.f1, "v2")
			assert.strictEqual(req.params.q1, "v1")
			assert.strictEqual(req.params.f1, "v2")
			res.end("Hello")
		})
		server.unref()
		server.listen(0)
		assert.strictEqual((await request({
			url: server.rootUrl + "/path?q1=v1",
			dataType: "form",
			headers: {
				"accept-language": "zh-cn, zh;q=0.5"
			},
			data: {
				f1: "v2"
			},
			timeout: 300
		})).toString(), "Hello")
		server.close()
	}

	export async function jsonTest() {
		const server = new httpServer.HTTPServer(undefined, (req, res) => {
			assert.strictEqual(req.json.f1, "v1")
			assert.deepStrictEqual(JSON.parse(req.text), req.json)

			res.contentType = "application/json"
			assert.strictEqual(res.contentType, "application/json")

			const date = new Date()
			date.setMilliseconds(0)

			res.expires = date
			assert.strictEqual(res.expires.getTime(), date.getTime())
			res.expires = undefined
			assert.strictEqual(res.expires, undefined)
			res.expires = null
			assert.strictEqual(res.expires, undefined)

			res.lastModified = date
			assert.deepEqual(res.lastModified.getTime(), date.getTime())
			res.lastModified = undefined
			assert.strictEqual(res.lastModified, undefined)

			res.writeJSON({
				n1: "v2"
			})
		})
		server.unref()
		server.listen(0)
		assert.deepStrictEqual((await request({
			url: server.rootUrl + "/path?q1=v1",
			dataType: "json",
			data: {
				f1: "v1"
			},
			timeout: 300
		})), {
				n1: "v2"
			})
		server.close()
	}

	export async function optionsTest() {
		const server = new httpServer.HTTPServer(undefined, (req, res) => {
			assert.strictEqual(req.method, "OPTIONS")
			assert.strictEqual(req.contentLength, 0)
			res.contentLength = 0
			assert.strictEqual(res.contentLength, 0)
			res.end()
		})
		server.unref()
		server.listen(0)
		await request({
			url: server.rootUrl,
			method: "OPTIONS",
			timeout: 300
		})
		server.close()
	}

	export async function redirectTest() {
		const server = new httpServer.HTTPServer(undefined, (req, res) => {
			res.contentType = "text/plain"
			switch (req.query.q) {
				case "1":
					assert.strictEqual(res.redirectLocation, undefined)
					res.redirectLocation = undefined
					res.redirect(server.rootUrl + "/path?q=2")
					assert.strictEqual(res.redirectLocation, server.rootUrl + "/path?q=2")
					break
				case "2":
					res.writeHTML("Hello")
					break
			}
		})
		server.unref()
		server.listen(0)
		assert.deepStrictEqual((await request({
			url: server.rootUrl + "/path?q=1",
			timeout: 300
		})), "Hello")
		server.close()
	}

	export async function maxRedirectTest() {
		const server = new httpServer.HTTPServer(undefined, (req, res) => {
			res.redirect(server.rootUrl, false)
			res.statusCode = 301
			res.end()
		})
		server.unref()
		server.listen(0)
		await assert.rejects(async () => {
			await request({
				url: server.rootUrl + "/path?q=1",
				dataType: "json",
				data: {},
				timeout: 300
			})
		})
		server.close()
	}

	export async function cookieTest() {
		const server = new httpServer.HTTPServer(undefined, (req, res) => {
			res.contentType = "text/plain"
			switch (req.query.q) {
				case "1":
					res.setCookie("c2", "c2")
					res.setCookie("c3", "")
					const date = new Date()
					date.setDate(date.getDate() + 1)
					res.setCookie("c4", "c4", date, "domain", "path", true, true, "None")
					res.end("c1")
					break
				case "2":
					assert.strictEqual(req.cookies.c2, "c2")
					assert.strictEqual(req.cookies.c3, "")
					res.end(req.cookies.c2)
					break
			}
		})
		server.unref()
		server.listen(0)
		const cookieJar = new CookieJar()
		assert.deepStrictEqual((await request({
			url: server.rootUrl + "/path?q=1",
			cookieJar: cookieJar,
			timeout: 300
		})), "c1")
		assert.deepStrictEqual((await request({
			url: server.rootUrl + "/path?q=2",
			cookieJar: cookieJar,
			timeout: 300
		})), "c2")
		assert.strictEqual(cookieJar.getCookie(server.rootUrl, "c4"), undefined)
		server.close()
	}

	export async function uploadTest() {
		const buffer = Buffer.from("text")
		const server = new httpServer.HTTPServer(undefined, (req, res) => {
			assert.strictEqual(req.contentType, "multipart/form-data")
			assert.strictEqual(req.forms.f1, "v1")
			assert.strictEqual((req.forms.f2 as httpServer.HTTPFile).fileName, "f2.txt")
			assert.strictEqual((req.forms.f2 as httpServer.HTTPFile).contentType, undefined)
			assert.strictEqual((req.forms.f2 as httpServer.HTTPFile).contentLength, buffer.length)
			assert.strictEqual((req.forms.f2 as httpServer.HTTPFile).body.toString(), buffer.toString())
			assert.strictEqual((req.forms.f2 as httpServer.HTTPFile).text, buffer.toString())

			assert.strictEqual((req.forms.f3 as httpServer.HTTPFile).fileName, "f3.txt")
			assert.strictEqual((req.forms.f3 as httpServer.HTTPFile).contentType, "text/plain")
			assert.strictEqual((req.forms.f3 as httpServer.HTTPFile).contentLength, buffer.length)
			assert.strictEqual((req.forms.f3 as httpServer.HTTPFile).body.toString(), buffer.toString())
			assert.strictEqual((req.forms.f3 as httpServer.HTTPFile).text, buffer.toString())

			assert.strictEqual(req.files[0].fileName, "f2.txt")
			assert.strictEqual(req.files[1].fileName, "f3.txt")
			assert.strictEqual(req.files.length, 2)

			res.end()
		})
		server.unref()
		server.listen(0)
		assert.strictEqual((await request({
			url: server.rootUrl + "/path?q=1",
			dataType: "multipart",
			data: {
				"f1": "v1",
				"f2": {
					fileName: "f2.txt",
					body: buffer
				},
				"f3": {
					fileName: "f3.txt",
					contentType: "text/plain",
					body: buffer
				}
			},
			timeout: 300
		})).toString(), "")
		server.close()
	}

	export async function invalidUploadTest() {
		const server = new httpServer.HTTPServer(undefined, (req, res) => {
			assert.strictEqual(req.forms.f1, undefined)

			res.end()
		})
		server.unref()
		server.listen(0)
		assert.strictEqual((await request({
			url: server.rootUrl + "/path?q=1",
			dataType: "multipart/form-data",
			data: `INVALID`,
			timeout: 300
		})).toString(), "")
		server.close()
	}

	export async function defaultServerTest() {
		const server = new httpServer.HTTPServer()
		assert.strictEqual(server.rootUrl, undefined)

		const server2 = new httpServer.HTTPServer({ https: true })
		assert.strictEqual(server2.rootUrl, undefined)

		const server3 = new httpServer.HTTPServer({ http2: true })
		assert.strictEqual(server3.rootUrl, undefined)

		const server4 = new httpServer.HTTPServer({ https: true, http2: true })
		assert.strictEqual(server4.rootUrl, undefined)
	}

	export async function gzipTest() {
		const server = new httpServer.HTTPServer(undefined, (req, res) => {
			assert.strictEqual(req.text, "123")
			res.end(req.body)
		})
		server.unref()
		server.listen(0)
		assert.strictEqual((await request({
			url: server.rootUrl + "/path?q=1",
			headers: {
				"content-encoding": "gzip"
			},
			dataType: "text/plain",
			data: gzipSync("123"),
			timeout: 300
		})).toString(), "123")
	}

	export async function deflateTest() {
		const server = new httpServer.HTTPServer(undefined, (req, res) => {
			assert.strictEqual(req.text, "123")
			res.end(req.body)
		})
		server.unref()
		server.listen(0)
		assert.strictEqual((await request({
			url: server.rootUrl + "/path?q=1",
			headers: {
				"content-encoding": "deflate"
			},
			dataType: "text/plain",
			data: deflateSync("123"),
			timeout: 300
		})).toString(), "123")
	}

	export async function brTest() {
		// 忽略不支持的 Node 版本
		if (!brotliCompressSync) {
			return
		}
		const server = new httpServer.HTTPServer(undefined, (req, res) => {
			assert.strictEqual(req.text, "123")
			res.end(req.body)
		})
		server.unref()
		server.listen(0)
		assert.strictEqual((await request({
			url: server.rootUrl + "/path?q=1",
			headers: {
				"content-encoding": "br"
			},
			dataType: "text/plain",
			data: brotliCompressSync("123"),
			timeout: 300
		})).toString(), "123")
	}

	export async function maxAllowedContentLengthTest() {
		const server = new httpServer.HTTPServer({
			maxAllowedContentLength: 0
		})
		server.unref()
		server.listen(0)
		await assert.rejects(async () => await request({
			url: server.rootUrl,
			method: "POST",
			data: "text"
		}))
		server.close()
	}

	export async function sessionTest() {
		const server = new httpServer.HTTPServer(undefined, (req, res) => {
			res.contentType = "text/plain"
			switch (req.query.q) {
				case "1":
					server.sessions.getSession(req, res).login = true
					res.end("c1")
					break
				case "2":
					assert.strictEqual(server.sessions.getSession(req, res).login, true)
					res.end("c2")
					break
			}
		})
		server.unref()
		server.listen(0)
		const cookieJar = new CookieJar()
		assert.deepStrictEqual((await request({
			url: server.rootUrl + "/path?q=1",
			cookieJar: cookieJar,
			timeout: 300
		})), "c1")
		assert.deepStrictEqual((await request({
			url: server.rootUrl + "/path?q=2",
			cookieJar: cookieJar,
			timeout: 300
		})), "c2")
		server.close()
		server.sessions.clean()
		server.sessions = null
	}

}