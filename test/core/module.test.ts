import * as assert from "assert"
import { resolve } from "path"
import * as mod from "../../src/core/module"
import { SourceMapBuilder } from "../../src/utils/sourceMap"

export namespace moduleTest {

	export function hashTest() {
		const module = new mod.Module("foo/entry.jsx", true)
		const oldHash = module.hash
		module.reset(mod.ModuleState.initial)
		assert.notStrictEqual(module.hash, oldHash)
		assert.notStrictEqual(module.clone().hash, oldHash)

		module.hash = oldHash
		assert.strictEqual(module.hash, oldHash)
	}

	export function resetTest() {
		const module = new mod.Module("foo/entry.jsx", true)
		module.addDependency("1")
		module.addDependency({ href: "2" })
		module.addGenerated("1", "2")
		module.addError("1")
		module.addWarning("1")
		module.setProp("k", "v")
		module.reset(mod.ModuleState.deleted)
		assert.strictEqual(module.dependencies ? module.dependencies.length : 0, 0)
		assert.strictEqual(module.generatedModules ? module.generatedModules.length : 0, 0)
		assert.strictEqual(module.logs ? module.logs.length : 0, 0)
	}

	export function cloneTest() {
		const module = new mod.Module("foo/entry.jsx", true)
		module.addDependency("1")
		module.addDependency({ href: "2" })
		module.addGenerated("1", "2")
		module.addError("1")
		module.addWarning("1")
		module.setProp("k", "v")
		module.clone().addError("1")
		assert.strictEqual(module.dependencies ? module.dependencies.length : 0, 2)
		assert.strictEqual(module.generatedModules ? module.generatedModules.length : 0, 1)
		assert.strictEqual(module.logs ? module.logs.length : 0, 2)
		assert.strictEqual(module.getProp("k"), "v")
	}

	export function pathTest() {
		const module = new mod.Module("foo/entry.jsx", true)
		assert.strictEqual(module.originalPath, "foo/entry.jsx")
		assert.strictEqual(module.path, "foo/entry.jsx")

		module.path = "foo/moved.js"
		assert.strictEqual(module.path, "foo/moved.js")
	}

	export function dirTest() {
		const module = new mod.Module("foo/entry.jsx", true)
		assert.strictEqual(module.dir, "foo")
		module.dir = "goo"
		assert.strictEqual(module.dir, "goo")
		assert.strictEqual(module.path, "goo/entry.jsx")
	}

	export function nameTest() {
		const module = new mod.Module("foo/entry.jsx", true)
		assert.strictEqual(module.name, "entry")
		module.name = "moved"
		assert.strictEqual(module.name, "moved")
		assert.strictEqual(module.path, "foo/moved.jsx")
	}

	export function extTest() {
		const module = new mod.Module("foo/entry.jsx", true)
		assert.strictEqual(module.ext, ".jsx")
		module.ext = ".js"
		assert.strictEqual(module.ext, ".js")
		assert.strictEqual(module.path, "foo/entry.js")
	}

	export function prependNameTest() {
		const module = new mod.Module("foo/entry.jsx", true)
		module.prependName("this_")
		assert.strictEqual(module.path, "foo/this_entry.jsx")
	}

	export function appendNameTest() {
		const module = new mod.Module("foo/entry.jsx", true)
		module.appendName(".min")
		assert.strictEqual(module.path, "foo/entry.min.jsx")
	}

	export function matchTest() {
		assert.strictEqual(new mod.Module("foo/entry.jsx", true).match("foo/entr?.jsx"), true)
		assert.strictEqual(new mod.Module(resolve("foo/entry.jsx"), true).match("foo/entr?.jsx"), true)
	}

	export function matchOriginalTest() {
		assert.strictEqual(new mod.Module("foo/entry.jsx", true).matchOriginal("foo/entr?.jsx"), true)
		assert.strictEqual(new mod.Module(resolve("foo/entry.jsx"), true).matchOriginal("foo/entr?.jsx"), true)
	}

	export function resolvePathTest() {
		const module = new mod.Module("foo/entry.jsx", true)
		assert.strictEqual(module.resolvePath("href"), `foo/href`)
		assert.strictEqual(module.resolvePath(resolve("href")), resolve("href"))
	}

	export function relativePathTest() {
		const module = new mod.Module("foo/entry.jsx", true)
		assert.strictEqual(module.relativePath("href"), `../href`)
	}

	export function bufferOrContentTest() {
		const module = new mod.Module("foo/entry.jsx", true)
		assert.strictEqual(module.bufferOrContent, undefined)

		module.bufferOrContent = "content"
		assert.strictEqual(module.bufferOrContent, "content")

		module.bufferOrContent = Buffer.from("content")
		assert.deepStrictEqual(module.bufferOrContent, Buffer.from("content"))

		module.data = { generate() { return { data: "content" } } }
		assert.strictEqual(module.bufferOrContent, "content")

		assert.strictEqual(module.data, module.bufferOrContent)
	}

	export function contentTest() {
		const module = new mod.Module("foo/entry.jsx", true)
		assert.strictEqual(module.content, undefined)

		module.content = "content"
		assert.strictEqual(module.content, "content")
		assert.strictEqual(module.buffer.toString(), "content")

		module.buffer = Buffer.from("content")
		assert.strictEqual(module.content, "content")
		assert.strictEqual(module.buffer.toString(), "content")

		module.data = { generate() { return { data: "content" } } }
		assert.strictEqual(module.content, "content")
		assert.strictEqual(module.buffer.toString(), "content")
	}

	export function bufferTest() {
		const module = new mod.Module("foo/entry.jsx", true)
		assert.strictEqual(module.buffer, undefined)

		module.buffer = Buffer.from("content")
		assert.strictEqual(module.buffer.toString(), "content")
		assert.strictEqual(module.content, "content")

		module.content = "content"
		assert.strictEqual(module.buffer.toString(), "content")
		assert.strictEqual(module.content, "content")

		module.data = { generate() { return { data: "content" } } }
		assert.strictEqual(module.buffer.toString(), "content")
		assert.strictEqual(module.content, "content")

		module.data = { generate() { return { data: Buffer.from("content") } } }
		assert.strictEqual(module.buffer.toString(), "content")
		assert.strictEqual(module.content, "content")
	}

	export function sizeTest() {
		const module = new mod.Module("foo/entry.jsx", true)
		assert.strictEqual(module.size, -1)

		module.buffer = Buffer.alloc(11)
		assert.strictEqual(module.size, 11)

		module.content = Buffer.alloc(11).toString()
		assert.strictEqual(module.size, 11)

		module.data = { generate() { return { data: "content" } } }
		assert.strictEqual(module.size, Buffer.from("content").length)
	}

	export function md5Test() {
		const module = new mod.Module("foo/entry.jsx", true)
		assert.strictEqual(module.md5, "d41d8cd98f00b204e9800998ecf8427e")
		module.content = "foo"
		assert.strictEqual(module.md5, "acbd18db4cc2f85cedef654fccc4a4d8")

		module.buffer = Buffer.from("foo")
		assert.strictEqual(module.md5, "acbd18db4cc2f85cedef654fccc4a4d8")
	}

	export function sha1Test() {
		const module = new mod.Module("foo/entry.jsx", true)
		assert.strictEqual(module.sha1, "da39a3ee5e6b4b0d3255bfef95601890afd80709")
		module.content = "foo"
		assert.strictEqual(module.sha1, "0beec7b5ea3f0fdbc95d0dd47f3c5bc275da8a33")

		module.buffer = Buffer.from("foo")
		assert.strictEqual(module.sha1, "0beec7b5ea3f0fdbc95d0dd47f3c5bc275da8a33")
	}

	export function sourceMapDataTest() {
		const module = new mod.Module("foo/entry.jsx", true)
		assert.deepStrictEqual(module.sourceMapData, undefined)
		module.sourceMapData = JSON.stringify({ version: 3, mappings: "", sources: ["source"] })
		assert.deepStrictEqual(JSON.parse(module.sourceMapString), { version: 3, file: "foo/entry.jsx", mappings: "", sources: [`foo/source`] })
		assert.deepStrictEqual(module.sourceMapObject, { version: 3, file: "foo/entry.jsx", mappings: "", sources: [`foo/source`] })
		assert.deepStrictEqual(module.sourceMapBuilder.toJSON(), { version: 3, file: "foo/entry.jsx", mappings: "", sources: [`foo/source`] })
		module.sourceMapData = undefined
		assert.deepStrictEqual(module.sourceMapData, undefined)

		module.data = { generate() { return { data: Buffer.from("content") } } }
		assert.strictEqual(module.sourceMapData, undefined)
	}

	export function sourceMapStringTest() {
		const module = new mod.Module("foo/entry.jsx", true)
		assert.deepStrictEqual(module.sourceMapString, undefined)
		module.sourceMapString = JSON.stringify({ version: 3, mappings: "", sources: ["source"] })
		assert.deepStrictEqual(JSON.parse(module.sourceMapString), { version: 3, file: "foo/entry.jsx", mappings: "", sources: [`foo/source`] })
		assert.deepStrictEqual(module.sourceMapObject, { version: 3, file: "foo/entry.jsx", mappings: "", sources: [`foo/source`] })
		assert.deepStrictEqual(module.sourceMapBuilder.toJSON(), { version: 3, file: "foo/entry.jsx", mappings: "", sources: [`foo/source`] })
		module.sourceMapString = undefined
		assert.deepStrictEqual(module.sourceMapString, undefined)
	}

	export function sourceMapObjectTest() {
		const module = new mod.Module("foo/entry.jsx", true)
		assert.deepStrictEqual(module.sourceMapObject, undefined)
		module.sourceMapObject = { version: 3, mappings: "", sources: ["source"] }
		assert.deepStrictEqual(JSON.parse(module.sourceMapString), { version: 3, file: "foo/entry.jsx", mappings: "", sources: [`foo/source`] })
		assert.deepStrictEqual(module.sourceMapObject, { version: 3, file: "foo/entry.jsx", mappings: "", sources: [`foo/source`] })
		assert.deepStrictEqual(module.sourceMapBuilder.toJSON(), { version: 3, file: "foo/entry.jsx", mappings: "", sources: [`foo/source`] })
		module.sourceMapObject = undefined
		assert.deepStrictEqual(module.sourceMapObject, undefined)
		module.sourceMapObject = {} as any
	}

	export function sourceMapBuilderTest() {
		const module = new mod.Module("foo/entry.jsx", true)
		assert.deepStrictEqual(module.sourceMapBuilder, undefined)
		module.sourceMapBuilder = new SourceMapBuilder({ version: 3, mappings: "", sources: ["source"] })
		assert.deepStrictEqual(JSON.parse(module.sourceMapString), { version: 3, file: "foo/entry.jsx", mappings: "", sources: [`foo/source`] })
		assert.deepStrictEqual(module.sourceMapObject, { version: 3, file: "foo/entry.jsx", mappings: "", sources: [`foo/source`] })
		assert.deepStrictEqual(module.sourceMapBuilder.toJSON(), { version: 3, file: "foo/entry.jsx", mappings: "", sources: [`foo/source`] })
		module.sourceMapBuilder = undefined
		assert.deepStrictEqual(module.sourceMapBuilder, undefined)
	}

	export function applySourceMapTest() {
		const module = new mod.Module("foo/entry.jsx", true)
		module.applySourceMap({ version: 3, mappings: "", sources: ["source"], sourcesContent: ["content"], names: ["name"] })
		assert.deepStrictEqual(JSON.parse(module.sourceMapString), { version: 3, file: "foo/entry.jsx", mappings: "", sources: [`foo/source`], sourcesContent: ["content"], names: ["name"] })
		assert.deepStrictEqual(module.sourceMapObject, { version: 3, file: "foo/entry.jsx", mappings: "", sources: [`foo/source`], sourcesContent: ["content"], names: ["name"] })
		assert.deepStrictEqual(module.sourceMapBuilder.toJSON(), { version: 3, file: "foo/entry.jsx", mappings: "", sources: [`foo/source`], sourcesContent: ["content"], names: ["name"] })
		module.applySourceMap({ version: 3, mappings: "", sources: ["source"] })
		module.applySourceMap(undefined)
		assert.deepStrictEqual(module.sourceMapBuilder, undefined)
	}

	export function addErrorTest() {
		const module = new mod.Module("foo/entry.jsx", true)
		module.content = "content"
		assert.strictEqual(module.hasErrors, false)
		module.addError("error")
		assert.strictEqual(module.hasErrors, true)
		assert.strictEqual(module.addError(new Error("error")).message, "error")
		assert.strictEqual(module.addError({ message: "error" }).message, "error")
		assert.strictEqual(module.addError({ message: "error", fileName: null }).message, "error")
		assert.strictEqual(module.addError({ message: "error", fileName: "foo" }).message, "error")
		assert.strictEqual(module.addError({ message: "error", fileName: "foo/entry.jsx" }).message, "error")
		assert.strictEqual(module.addError({ message: "error", fileName: "entry.jsx", index: 0, endIndex: 0 }).message, "error")
		assert.strictEqual(module.addError({ message: "error", fileName: "entry.jsx", line: 0, endLine: 10 }).message, "error")
		assert.strictEqual(module.addError({ message: "error", line: 0, codeFrame: "" }).message, "error")
	}

	export function addWarningTest() {
		const module = new mod.Module("foo/entry.jsx", true)
		module.content = "content"
		assert.strictEqual(module.hasWarnings, false)
		module.addWarning("warning")
		assert.strictEqual(module.hasWarnings, true)
	}

	export namespace computeOriginalLocationTest {

		export function unmodified() {
			const module = new mod.Module("foo/entry.jsx", true)
			module.content = "0123456"
			const submodule = module.createSubmodule("sub.jsx", "3456", 3)
			assert.strictEqual(submodule.addError({ index: 1 }).fileName, "foo/entry.jsx")
			assert.strictEqual(submodule.addError({ index: 1 }).line, 0)
			assert.strictEqual(submodule.addError({ index: 1 }).column, 4)
			assert.strictEqual(submodule.addError({ index: 1, endIndex: 1 }).endLine, 0)
			assert.strictEqual(submodule.addError({ index: 1, endIndex: 1 }).endColumn, 4)
		}

		export function sourceModified() {
			const module = new mod.Module("foo/entry.jsx", true)
			module.content = "0123456"

			module.content = "abcdefg"
			module.sourceMapBuilder = new SourceMapBuilder()
			module.sourceMapBuilder.addMapping(0, 0, "source", 100, 100)

			const submodule = module.createSubmodule("sub.jsx", "3456", 3)
			assert.strictEqual(submodule.addError({ index: 1 }).fileName, "source")
			assert.strictEqual(submodule.addError({ index: 1 }).line, 100)
			assert.strictEqual(submodule.addError({ index: 1 }).column, 104)

			assert.strictEqual(submodule.addError({ line: 0, endLine: 0 }).column, undefined)
			assert.strictEqual(submodule.addError({ index: 20 }).line, 100)
		}

		export function sourceModifiedWithoutSource() {
			const module = new mod.Module("foo/entry.jsx", true)
			module.content = "0123456"

			module.content = "abcdefg"
			module.sourceMapBuilder = new SourceMapBuilder()
			module.sourceMapBuilder.addMapping(0, 0)

			assert.strictEqual(module.addError({ index: 1 }).fileName, "foo/entry.jsx")
			assert.strictEqual(module.addError({ index: 1 }).line, 0)
			assert.strictEqual(module.addError({ index: 1 }).column, 1)

			const submodule = module.createSubmodule("sub.jsx", "3456", 3)
			assert.strictEqual(submodule.addError({ index: 1 }).fileName, "foo/entry.jsx")
			assert.strictEqual(submodule.addError({ index: 1 }).line, 0)
			assert.strictEqual(submodule.addError({ index: 1 }).column, 4)
		}

		export function sourceModifiedWithoutSourceMap() {
			const module = new mod.Module("foo/entry.jsx", true)
			module.content = "0123456"

			module.content = "abcdefg"

			const submodule = module.createSubmodule("sub.jsx", "3456", 3)
			assert.strictEqual(submodule.addError({ index: 1 }).fileName, "foo/entry.jsx")
			assert.strictEqual(submodule.addError({ index: 1 }).line, 0)
			assert.strictEqual(submodule.addError({ index: 1 }).column, 4)
		}

		export function childModified() {
			const module = new mod.Module("foo/entry.jsx", true)
			module.content = "0123456\n89"

			const submodule = module.createSubmodule("sub.jsx", "3456", 3)

			submodule.content = "abcdefg"
			submodule.sourceMapBuilder = new SourceMapBuilder()
			submodule.sourceMapBuilder.addMapping(0, 0, "source", 100, 100)
			submodule.sourceMapBuilder.addMapping(0, 4, "foo/entry.jsx", 200, 200)

			assert.strictEqual(submodule.addError({ index: 1 }).fileName, "source")
			assert.strictEqual(submodule.addError({ index: 1 }).line, 100)
			assert.strictEqual(submodule.addError({ index: 1 }).column, 101)

			assert.strictEqual(submodule.addError({ index: 0, endIndex: 0 }).fileName, "source")
			assert.strictEqual(submodule.addError({ index: 0, endIndex: 0 }).line, 100)
			assert.strictEqual(submodule.addError({ index: 0, endIndex: 0 }).column, 100)

			assert.strictEqual(submodule.addError({ index: 5, endIndex: 8 }).fileName, "foo/entry.jsx")
			assert.strictEqual(submodule.addError({ index: 5, endIndex: 8 }).line, 200)
			assert.strictEqual(submodule.addError({ index: 5, endIndex: 8 }).column, 201)
		}

		export function childModifiedWithoutSourceMap() {
			const module = new mod.Module("foo/entry.jsx", true)
			module.content = "0123456"
			const submodule = module.createSubmodule("sub.jsx", "3456", 3)
			submodule.content = "abcdefg"
			assert.strictEqual(submodule.addError({ index: 1 }).fileName, `foo/entry.jsx`)
			assert.strictEqual(submodule.addError({ index: 1 }).line, 0)
			assert.strictEqual(submodule.addError({ index: 1 }).column, 4)
		}

		export function bothModified() {
			const module = new mod.Module("foo/entry.jsx", true)
			module.content = "0123456"

			module.content = "abcdefg"
			module.sourceMapBuilder = new SourceMapBuilder()
			module.sourceMapBuilder.addMapping(0, 0, "source1", 10, 10)

			const submodule = module.createSubmodule("sub.jsx", "3456", 3)

			submodule.content = "abcdefg"
			submodule.sourceMapBuilder = new SourceMapBuilder()
			submodule.sourceMapBuilder.addMapping(0, 0, "source2", 100, 100)
			submodule.sourceMapBuilder.addMapping(0, 4, "sub.jsx", 200, 200)

			assert.strictEqual(submodule.addError({ index: 1 }).fileName, "source2")
			assert.strictEqual(submodule.addError({ index: 1 }).line, 100)
			assert.strictEqual(submodule.addError({ index: 1 }).column, 101)

			assert.strictEqual(submodule.addError({ index: 5 }).fileName, "sub.jsx")
			assert.strictEqual(submodule.addError({ index: 5 }).line, 200)
			assert.strictEqual(submodule.addError({ index: 5 }).column, 201)
			assert.strictEqual(submodule.addError({ index: 5, endIndex: 5 }).endLine, 200)
			assert.strictEqual(submodule.addError({ index: 5, endIndex: 5 }).endColumn, 201)

			assert.strictEqual(submodule.addError({ index: 1, endIndex: 5 }).endLine, undefined)
			assert.strictEqual(submodule.addError({ index: 1, endIndex: 5 }).endColumn, undefined)
		}

		export function forbidon() {
			const module = new mod.Module("foo/entry.jsx", true)
			module.content = "0123456"
			const submodule = module.createSubmodule("sub.jsx", "3456", 3)
			assert.strictEqual(submodule.addError({ index: 5, content: submodule.content }).fileName, "foo/entry.jsx")
			assert.strictEqual(submodule.addError({ index: 5, content: submodule.content }).line, 0)
			assert.strictEqual(submodule.addError({ index: 5, content: submodule.content }).column, 8)
		}

	}

	export function addDependencyTest() {
		const module = new mod.Module("foo/entry.jsx", true)
		module.addDependency("f1")
		module.addDependency({ href: "f2" })
		assert.strictEqual(module.dependencies!.length, 2)
	}

	export function updateTest() {
		const module = new mod.Module("foo/entry.jsx", true)
		module.update("foo")
		assert.strictEqual(module.content, "foo")

		module.update("goo", undefined, ["error"], ["dependency"])
		assert.strictEqual(module.content, "goo")
		assert.strictEqual(module.hasErrors, true)
		assert.strictEqual(!!module.dependencies, true)
	}

	export function spliceTest() {
		const module = new mod.Module("foo/entry.jsx", true)
		module.data = "foo"
		module.splice(1, 1, "g")
		assert.strictEqual(module.content, "fgo")

		module.sourceMap = true
		module.splice(1, 1, "h")
		assert.strictEqual(module.content, "fho")

		module.splice(0, 0, "")
		assert.strictEqual(module.content, "fho")
	}

	export function replaceTest() {
		const module = new mod.Module("foo/entry.jsx", true)
		module.data = "foo"
		module.replace("f", "g")
		assert.strictEqual(module.content, "goo")

		module.sourceMap = true
		module.replace("g", "h")
		assert.strictEqual(module.content, "hoo")

		module.replace("g", "h")
		assert.strictEqual(module.content, "hoo")
	}

	export function propTest() {
		const module = new mod.Module("foo/entry.jsx", true)
		assert.strictEqual(module.getProp("key"), undefined)
		assert.strictEqual(module.deleteProp("key"), false)
		module.setProp("key", "value")
		assert.strictEqual(module.getProp("key"), "value")
		assert.strictEqual(module.deleteProp("key"), true)
		assert.strictEqual(module.getProp("key"), undefined)
		assert.strictEqual(module.deleteProp("key"), false)
	}

	export function addGeneratedTest() {
		const module = new mod.Module("foo/entry.jsx", true)
		assert.strictEqual(module.addGenerated("other", "generated").path, `foo/other`)

		assert.strictEqual(module.addGenerated(resolve("other"), "generated").path, resolve("other"))
	}

	export function createSubmoduleTest() {
		const module = new mod.Module("foo/entry.jsx", true)
		module.content = ""
		assert.strictEqual(module.createSubmodule("other").dir, `foo`)
		assert.strictEqual(module.createSubmodule("other", "", 0).createSubmodule("other2", "", 0).dir, `foo`)
		assert.strictEqual(module.createSubmodule("other", "\n2", 0).createSubmodule("other2", "", 2).dir, `foo`)
	}

}