import * as assert from "assert"
import { resolve } from "path"
import * as builder from "../../src/core/builder"
import { Module } from "../../src/core/module"
import { LogLevel } from "../../src/utils/logger"
import { MemoryFileSystem } from "../../src/utils/memoryFileSystem"

export namespace builderTest {

	export function formatPathTest() {
		const b = new builder.Builder({ rootDir: "." })
		const module = new Module("dir/foo.js", false)
		assert.strictEqual(b.formatPath("[<path>]", module), "[dir/foo.js]")
		assert.strictEqual(b.formatPath("[<dir>]", module), "[dir]")
		assert.strictEqual(b.formatPath("[<name>]", module), "[foo]")
		assert.strictEqual(b.formatPath("[<ext>]", module), "[.js]")
		assert.strictEqual(b.formatPath("<hash>", module), module.hash.slice(0, 8))
		assert.strictEqual(b.formatPath("<hash:0>", module), "")
		assert.strictEqual(b.formatPath("<sha1>", module), module.sha1.slice(0, 8))
		assert.strictEqual(b.formatPath("<sha1:0>", module), "")
		assert.strictEqual(b.formatPath("<md5>", module), module.md5.slice(0, 8))
		assert.strictEqual(b.formatPath("<md5:0>", module), "")
		assert.notStrictEqual(b.formatPath("<random>", module), "<random>")
		assert.strictEqual(b.formatPath("<random:0>", module), "")
		assert.notStrictEqual(b.formatPath("<date>", module), "<date>")
		assert.strictEqual(b.formatPath("<date:>", module), "")
		assert.notStrictEqual(b.formatPath("<version>", module), "<version>")
		assert.strictEqual(b.formatPath("<unknown>", module), "<unknown>")
	}

	export function resolvePathTest() {
		assert.strictEqual(new builder.Builder({ rootDir: "." }).resolvePath("src"), resolve("src"))
	}

	export function relativePathTest() {
		assert.strictEqual(new builder.Builder({ rootDir: "." }).relativePath("src"), "src")
	}

	export async function buildTest() {
		const b = new builder.Builder({
			rootDir: "src",
			outDir: "dist",
			compilers: [],
			optimizers: [],
			sourceMap: false,
			logger: { logLevel: LogLevel.silent, progress: false },
			fs: new MemoryFileSystem()
		})
		await b.fs.writeFile("src/entry.txt", "var x = 1")
		const r = await b.build()
		assert.strictEqual(r.errorCount, 0)
		assert.strictEqual(r.warningCount, 0)
		assert.strictEqual(r.entryModules.length, 1)
		assert.strictEqual(r.entryModules[0].path, resolve("src/entry.txt"))
		assert.strictEqual(r.fullBuild, true)
		assert.strictEqual(await b.fs.readText("dist/entry.txt"), "var x = 1")
	}

}