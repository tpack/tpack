import * as assert from "assert"
import * as esm from "../../src/utils/esm"

export namespace esmTest {

	export function transformESModuleToCommonJSTest() {
		assert.strictEqual(esm.transformESModuleToCommonJS(`export var a = 1`), `var a = 1\nmodule.exports.a = a;`)

		assert.strictEqual(esm.transformESModuleToCommonJS(`var a = 1`), `var a = 1`)
		assert.strictEqual(esm.transformESModuleToCommonJS(`var a = "export var x"`), `var a = "export var x"`)

		assert.strictEqual(esm.transformESModuleToCommonJS(`export let a = 1`), `let a = 1\nmodule.exports.a = a;`)
		assert.strictEqual(esm.transformESModuleToCommonJS(`export const a = 1`), `const a = 1\nmodule.exports.a = a;`)
		assert.strictEqual(esm.transformESModuleToCommonJS(`export function a() {}`), `function a() {}\nmodule.exports.a = a;`)
		assert.strictEqual(esm.transformESModuleToCommonJS(`export async function a() {}`), `async function a() {}\nmodule.exports.a = a;`)
		assert.strictEqual(esm.transformESModuleToCommonJS(`export function * a() {}`), `function * a() {}\nmodule.exports.a = a;`)
		assert.strictEqual(esm.transformESModuleToCommonJS(`export function * a() {}`), `function * a() {}\nmodule.exports.a = a;`)
		assert.strictEqual(esm.transformESModuleToCommonJS(`export function *a() {}`), `function *a() {}\nmodule.exports.a = a;`)
		assert.strictEqual(esm.transformESModuleToCommonJS(`export async function *a() {}`), `async function *a() {}\nmodule.exports.a = a;`)

		assert.strictEqual(esm.transformESModuleToCommonJS(`export default 1`), `module.exports.default = 1\nObject.defineProperty(module.exports, "__esModule", { value: true });`)
		assert.strictEqual(esm.transformESModuleToCommonJS(`export default var a`), `var a\nObject.defineProperty(module.exports, "__esModule", { value: true });\nmodule.exports.default = a;`)

		assert.strictEqual(esm.transformESModuleToCommonJS(`export * from "fs"`), `Object.assign(module.exports, require("fs"));`)
		assert.strictEqual(esm.transformESModuleToCommonJS(`export {x} from "fs"`), `const {x} = require("fs"); Object.assign(module.exports, {x});`)
		assert.strictEqual(esm.transformESModuleToCommonJS(`export {x as y} from "fs"`), `const {x : y} = require("fs"); Object.assign(module.exports, {x : y});`)

		assert.strictEqual(esm.transformESModuleToCommonJS(`import "fs"`), `require("fs");`)
		assert.strictEqual(esm.transformESModuleToCommonJS(`import * as fs from "fs"`), `const fs = require("fs");`)
		assert.strictEqual(esm.transformESModuleToCommonJS(`import {readFile} from "fs"`), `const {readFile} = require("fs");`)
		assert.strictEqual(esm.transformESModuleToCommonJS(`import {readFile as read} from "fs"`), `const {readFile : read} = require("fs");`)
		assert.strictEqual(esm.transformESModuleToCommonJS(`import {readFile as read, writeFile} from "fs"`), `const {readFile : read, writeFile} = require("fs");`)

		assert.strictEqual(esm.transformESModuleToCommonJS(`import fs from "fs"`), `const __fs = require("fs"), fs = __fs.__esModule ? __fs.default : __fs;`)
		assert.strictEqual(esm.transformESModuleToCommonJS(`import fs, {readFile} from "fs"`), `const __fs = require("fs"), fs = __fs.__esModule ? __fs.default : __fs, {readFile} = __fs;`)
	}

}