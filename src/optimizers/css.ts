import { dirname, resolve } from "path"
import { Module } from "../core/module"
import { Processor } from "../core/processor"
import { Compiler } from "../compilers/common"

export default class CleanCSS extends Compiler implements Processor {
	get vendorName() { return "clean-css" }
	async compile(module: Module, options: any, CleanCSS: any) {
		const result = await new CleanCSS({
			sourceMap: module.sourceMap,
			inline: false,
			rebase: false,
			rebaseTo: dirname(module.originalPath),
			...options,
			returnPromise: true
		}).minify({
			[module.originalPath]: {
				styles: module.content,
				sourceMap: module.sourceMapObject
			}
		})
		for (const error of result.errors) {
			module.addError(formatMessage(error))
		}
		for (const warning of result.warnings) {
			module.addWarning(formatMessage(warning))
		}
		module.content = result.styles
		module.sourceMapObject = result.sourceMap

		function formatMessage(message: string) {
			const at = / at (.*):(\d+):(\d+)\.(?: Ignoring\.)?$/.exec(message)
			if (at) {
				return {
					message: message.slice(0, -at[0].length),
					fileName: resolve(at[1]),
					line: +at[2] - 1,
					column: +at[3]
				}
			}
			return { message }
		}
	}
}