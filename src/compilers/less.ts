import { Builder } from "../core/builder"
import { Module } from "../core/module"
import { Processor } from "../core/processor"
import { Compiler } from "./common"

export default class Less extends Compiler implements Processor {
	get outExt() { return ".css" }
	get vendorName() { return "less" }
	static parallel = true
	init(less: any, options: any, builder: Builder) {
		less.logger.addListener({
			debug: (msg: string) => { builder.logger.debug(msg) },
			info: (msg: string) => { builder.logger.debug(msg) },
			warn: (msg: string) => { builder.logger.warning(msg) },
			error: (msg: string) => { builder.logger.error(msg) }
		})
	}
	async compile(module: Module, options: any, less: any, builder: Builder) {
		try {
			const result = await less.render(module.content, {
				async: true,
				fileAsync: true,
				syncImport: true,
				filename: module.originalPath,
				sourceMap: module.sourceMap ? {} : undefined,
				paths: [builder.rootDir],
				rewriteUrls: "all",
				compress: false,
				...options
			})
			module.content = result.css
			module.applySourceMap(result.map)
			for (const dependency of result.imports) {
				module.addDependency(dependency)
			}
		} catch (e) {
			module.addError({
				message: e.message,
				fileName: e.filename,
				index: e.index,
				line: e.line - 1,
				column: e.column
			})
		}
	}
}