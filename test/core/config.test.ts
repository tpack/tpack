import * as assert from "assert"
import * as config from "../../src/core/config"
import { init, uninit } from "../helpers/fsHelper"

export namespace configTest {

	export async function afterEach() {
		await uninit()
	}

	export async function loadJSConfigTest() {
		await init({
			"myconfig.js": `export const foo = 1`
		})
		assert.strictEqual((await config.loadConfig("myconfig.js")).foo, 1)
	}

	export async function loadESConfigTest() {
		await init({
			"myconfig2.js": `import util from "util";export function foo(name){ return util.isString(name) }`
		})
		assert.strictEqual((await config.loadConfig("myconfig2.js")).foo("foo"), true)
	}

}