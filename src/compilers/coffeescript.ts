import { Module } from "../core/module"
import { Processor } from "../core/processor"
import { Compiler } from "./common"

export default class Coffee extends Compiler implements Processor {
	get outExt() { return ".js" }
	get vendorName() { return "coffeescript" }
	static parallel = true
	async compile(module: Module, options: any, coffeescript: any) {
		try {
			const result = coffeescript.compile(module.content, {
				sourceMap: module.sourceMap,
				...options
			})
			module.content = result.js || result
			module.applySourceMap(result.v3SourceMap)
		} catch (e) {
			module.addError({
				message: e.message,
				line: e.location && e.location.first_line,
				column: e.location && e.location.first_column,
				endLine: e.location && e.location.last_line,
				endColumn: e.location && e.location.last_column + 1
			})
		}
	}
}