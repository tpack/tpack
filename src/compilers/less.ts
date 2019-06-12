import { Processor } from "../core/options"
import { Builder } from "../core/builder"
import { VFile } from "../core/vfile"
import { Compiler } from "./common"

export default class Less extends Compiler implements Processor {
	get outExt() { return ".css" }
	get vendorName() { return "less" }
	init(less: any, options: any, builder: Builder) {
		less.logger.addListener({
			debug: (msg: string) => { builder.logger.debug(msg) },
			info: (msg: string) => { builder.logger.debug(msg) },
			warn: (msg: string) => { builder.logger.warning(msg) },
			error: (msg: string) => { builder.logger.error(msg) }
		})
	}
	async compile(file: VFile, options: any, less: any, builder: Builder) {
		try {
			const result = await less.render(file.content, {
				async: true,
				fileAsync: true,
				syncImport: true,
				filename: file.originalPath,
				sourceMap: file.sourceMap ? {} : undefined,
				paths: [builder.rootDir],
				rewriteUrls: "all",
				compress: false,
				...options
			})
			file.content = result.css
			file.applySourceMap(result.map)
			for (const dependency of result.imports) {
				file.addDependency({
					path: dependency,
					source: Less.name,
					type: "@import"
				})
			}
		} catch (e) {
			file.addError({
				source: Less.name,
				error: e,
				message: e.message,
				fileName: e.filename,
				index: e.index,
				line: e.line - 1,
				column: e.column
			})
		}
	}
}