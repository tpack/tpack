import * as assert from "assert"
import { build } from "./buildHelper"

export namespace htmlTest {

	export async function basicTest() {
		// assert.strictEqual((await build({
		// 	"main.html": `<div>Hello</div>`
		// })).content, `<div>Hello</div>`)
	}

	export async function includeTest() {
		// assert.strictEqual((await build({
		// 	"main.html": `<div><!--#include inc.html--></div>`,
		// 	"inc.html": "Hello"
		// })).content, `<div>Hello</div>`)
		// assert.strictEqual((await build({
		// 	"main.html": `<div><!--#include "inc.html"--></div>`,
		// 	"inc.html": "Hello"
		// })).content, `<div>Hello</div>`)
		// assert.strictEqual((await build({
		// 	"main.html": `<div><!--#include 'inc.html'--></div>`,
		// 	"inc.html": "Hello"
		// })).content, `<div>Hello</div>`)
		// assert.strictEqual((await build({
		// 	"main.html": `<div><!--#include virtual=inc.html--></div>`,
		// 	"inc.html": "Hello"
		// })).content, `<div>Hello</div>`)
		// assert.strictEqual((await build({
		// 	"main.html": `<div><!--#include virtual='inc.html'--></div>`,
		// 	"inc.html": "Hello"
		// })).content, `<div>Hello</div>`)
		// assert.strictEqual((await build({
		// 	"main.html": `<div><!--#include virtual='inc.html'--></div>`,
		// 	"inc.html": "Hello"
		// })).content, `<div>Hello</div>`)
		// assert.strictEqual((await build({
		// 	"main.html": `<div><!--#include virtual='inc.html'--> <!--#include virtual='inc.html'--></div>`,
		// 	"inc.html": "Hello"
		// })).content, `<div>Hello Hello</div>`)

		// assert.strictEqual((await build({
		// 	"main.html": `<div><!--#include 404.html--></div>`
		// })).content, `<div><!--#include 404.html--></div>`, "error")
		// assert.strictEqual((await build({
		// 	"main.html": `<div><!--#include 404.html--></div>`
		// })).originalModule!.logs.length, 1, "error")

		// assert.strictEqual((await build({
		// 	"main.html": `<div><!--   #include    ./inc.html   --></div>`,
		// 	"inc.html": "Hello"
		// })).content, `<div>Hello</div>`)
		// assert.strictEqual((await build({
		// 	"main.html": `<div><!--#include include/inc.html--></div>`,
		// 	"include/inc.html": "H<!--#include inc2.html-->",
		// 	"include/inc2.html": "ello"
		// })).content, `<div>Hello</div>`, "include in include")

		// assert.strictEqual((await build({
		// 	"main.html": `<div><!--#include include/inc.html--></div>`,
		// 	"include/inc.html": "<img src=../entries/inc.jpg>",
		// 	"entries/inc.jpg": ""
		// })).content, `<div><img src=entries/inc.jpg></div>`, "relative path")

		assert.strictEqual((await build({
			"main.html": `<div><!--#include main.html--></div>`
		})).content, `<div><!--#include main.html--></div>`, "include self")
	}

}