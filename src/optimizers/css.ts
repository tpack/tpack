import { dirname, resolve } from "path"
import { Processor } from "../core/options"
import { VFile } from "../core/vfile"
import { Compiler } from "../compilers/common"

export default class CleanCSS extends Compiler implements Processor {
	get vendorName() { return "clean-css" }
	async compile(file: VFile, options: any, CleanCSS: any) {
		const result = await new CleanCSS({
			sourceMap: file.sourceMap,
			inline: false,
			rebase: false,
			rebaseTo: dirname(file.originalPath),
			...options,
			returnPromise: true
		}).minify({
			[file.originalPath]: {
				styles: file.content,
				sourceMap: file.sourceMapObject
			}
		})
		for (const error of result.errors) {
			file.addError(formatMessage(error))
		}
		for (const warning of result.warnings) {
			file.addWarning(formatMessage(warning))
		}
		file.content = result.styles
		file.sourceMapObject = result.sourceMap

		function formatMessage(message: string) {
			const at = / at (.*):(\d+):(\d+)\.(?: Ignoring\.)?$/.exec(message)
			if (at) {
				return {
					source: CleanCSS.name,
					message: message.slice(0, -at[0].length),
					fileName: resolve(at[1]),
					line: +at[2] - 1,
					column: +at[3]
				}
			}
			return { source: CleanCSS.name, message }
		}
	}
}