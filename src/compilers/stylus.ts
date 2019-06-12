import { dirname } from "path"
import { Processor } from "../core/options"
import { Builder } from "../core/builder"
import { VFile } from "../core/vfile"
import { Compiler } from "./common"

export default class Stylus extends Compiler implements Processor {
	get outExt() { return ".css" }
	get vendorName() { return "stylus" }
	compile(file: VFile, options: any, stylus: any, builder: Builder) {
		return new Promise<void>(resolve => {
			const style = stylus(file.content, {
				filename: file.originalPath,
				paths: [builder.rootDir],
				sourcemap: file.sourceMap ? {
					comment: false,
					basePath: dirname(file.originalPath)
				} : false,
				...options
			})
			style.define("url", stylus.resolver({
				nocheck: true,
			}))
			style.render((error: any, text: string) => {
				if (error) {
					if (error.name === "ParseError") {
						const match = /^(.*):(\d):(\d+)\n/.exec(error.message)
						if (match) {
							file.addError({
								source: Stylus.name,
								error: error,
								message: (/\n\n(.*)\n/.exec(error.message) || [0, error.message])[1],
								fileName: match[1],
								line: +match[2] - 1,
								column: +match[3] - 1
							})
						} else {
							file.addError({
								source: Stylus.name,
								error: error,
								message: error.message
							})
						}
					} else {
						file.addError({
							source: Stylus.name,
							error: error,
							message: (/\n\n(?:(?:Type)?Error\: )?(.*)\n/.exec(error.message) || [0, error.message])[1],
							fileName: builder.resolvePath(error.filename),
							line: error.lineno - 1,
							column: error.column - 1,
							content: error.input,
							detail: error.stylusStack
						})
					}
				} else {
					file.content = text
					file.applySourceMap(style.sourcemap)
					for (const dependency of style.deps()) {
						file.addDependency({
							path: dependency,
							source: Stylus.name,
							type: "@import"
						})
					}
				}
				resolve()
			})
		})
	}
}