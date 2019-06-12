import { Builder } from "../core/builder"
import { Processor } from "../core/options"
import { VFile } from "../core/vfile"
import { Compiler } from "./common"

export default class Sass extends Compiler implements Processor {
	get outExt() { return ".css" }
	get vendorName() { return "node-sass" }
	compile(file: VFile, options: any, sass: any, builder: Builder) {
		return new Promise<void>(resolve => {
			sass.render({
				file: file.originalPath,
				data: file.content,
				indentedSyntax: /\.sass$/i.test(file.originalPath),
				sourceMap: file.sourceMap,
				omitSourceMapUrl: true,
				outFile: file.originalPath,
				outputStyle: "expanded",
				includePaths: [builder.rootDir],
				...options
			}, (error: any, result: any) => {
				if (error) {
					file.addError({
						source: Sass.name,
						error: error,
						message: error.message,
						fileName: error.file,
						line: error.line - 1,
						column: error.column - 1
					})
				} else {
					file.buffer = result.css
					file.applySourceMap(result.map ? result.map.toString() : undefined)
					for (const dependency of result.stats.includedFiles) {
						if (dependency !== file.originalPath) {
							file.addDependency({
								path: dependency,
								source: Sass.name,
								type: "@import"
							})
						}
					}
				}
				resolve()
			})
		})
	}
}