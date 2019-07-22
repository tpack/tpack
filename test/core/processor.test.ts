import * as assert from "assert"
import { Builder } from "../../src/core/builder"
import { Module } from "../../src/core/module"
import * as processor from "../../src/core/processor"

export namespace processorTest {

	export async function processTest() {
		const bd = new Builder({ bundler: { target: "node" } })
		const runner = new processor.ProcessorRunner(bd, [
			{
				match: "*.js",
				process(module) {
					module.content += "2"
				}
			}
		], "default", processor.ProcessorRunner.createWorkerPool(bd, 2))
		const module = new Module("input.js", false)
		module.content = "input"
		await runner.process(module)
		assert.strictEqual(module.content, "input2")
	}

}