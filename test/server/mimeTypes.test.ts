import * as assert from "assert"
import * as mimeTypes from "../../src/server/mimeTypes"

export namespace mimeTypesTest {

	export function getMimeTypeTest() {
		assert.strictEqual(mimeTypes.getMimeType(".js"), "text/javascript")
		assert.strictEqual(mimeTypes.getMimeType("file.js"), "text/javascript")

		assert.strictEqual(mimeTypes.getMimeType(".404"), undefined)
		assert.strictEqual(mimeTypes.getMimeType(".js/404"), undefined)
		assert.strictEqual(mimeTypes.getMimeType(".js\\404"), undefined)

		assert.strictEqual(mimeTypes.getMimeType(".js", { ".js": "my" }), "my")
	}

	export function getExtByMimeTypeTest() {
		assert.strictEqual(mimeTypes.getExtByMimeType("text/javascript"), ".js")
		assert.strictEqual(mimeTypes.getExtByMimeType("application/404"), ".404")

		assert.strictEqual(mimeTypes.getExtByMimeType("my", { ".js": "my" }), ".js")
	}

}