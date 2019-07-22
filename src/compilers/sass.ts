import { Builder } from "../core/builder"
import { Module } from "../core/module"
import { Processor } from "../core/processor"
import { Compiler } from "./common"

export default class Sass extends Compiler implements Processor {
	get outExt() { return ".css" }
	get vendorName() { return "node-sass" }
	compile(module: Module, options: any, sass: any, builder: Builder) {
		return new Promise<void>(resolve => {
			sass.render({
				file: module.originalPath,
				data: module.content,
				indentedSyntax: /\.sass$/i.test(module.originalPath),
				sourceMap: module.sourceMap,
				omitSourceMapUrl: true,
				outFile: module.originalPath,
				outputStyle: "expanded",
				includePaths: [builder.rootDir],
				...options
			}, (error: any, result: any) => {
				if (error) {
					module.addError({
						message: error.message,
						fileName: error.file,
						line: error.line - 1,
						column: error.column - 1
					})
				} else {
					module.buffer = result.css
					module.applySourceMap(result.map ? result.map.toString() : undefined)
					for (const dependency of result.stats.includedFiles) {
						if (dependency !== module.originalPath) {
							module.addDependency(dependency)
						}
					}
				}
				resolve()
			})
		})
	}
}