import { Processor } from "../core/options"
import { VFile } from "../core/vfile"
import { Compiler } from "./common"

export default class Coffee extends Compiler implements Processor {
	get outExt() { return ".js" }
	get vendorName() { return "coffeescript" }
	async compile(file: VFile, options: any, coffeescript: any) {
		try {
			const result = coffeescript.compile(file.content, {
				sourceMap: file.sourceMap,
				...options
			})
			file.content = result.js || result
			file.applySourceMap(result.v3SourceMap)
		} catch (e) {
			file.addError({
				source: Coffee.name,
				error: e,
				line: e.location && e.location.first_line,
				column: e.location && e.location.first_column,
				endLine: e.location && e.location.last_line,
				endColumn: e.location && e.location.last_column + 1
			})
		}
	}
}