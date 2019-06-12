import { resolve } from "path"
import { Processor } from "../core/options"
import { Builder } from "../core/builder"
import { VFile } from "../core/vfile"
import { Compiler } from "./common"

/** 表示一个 TypeScript 插件 */
export default class TS extends Compiler implements Processor {
	get outExt() { return ".js" }
	get vendorName() { return "typescript" }
	compile(file: VFile, options: any, ts: any, builder: Builder) {
		// 忽略 .d.ts 文件
		if (/\.d\.ts$/i.test(file.originalPath)) {
			file.content = ""
			return
		}
		// 设置默认值
		if (typeof options === "string") {
			options = require(resolve(options)).compilerOptions
		}
		options = {
			compilerOptions: Object.assign({
				sourceMap: file.sourceMap,
				charset: builder.encoding,
				experimentalDecorators: true,
				newLine: "LF",
				jsx: /x$/i.test(file.originalPath) ? 2/*React*/ : 1/*Preserve*/
			}, options),
			fileName: file.originalPath,
			reportDiagnostics: true
		}
		delete options.compilerOptions.outDir

		const result = ts.transpileModule(file.content, options)
		if (result.sourceMapText) {
			// TS 未提供 API 以删除 # sourceMappingURL，手动删除之。
			result.outputText = result.outputText.replace(/\/\/# sourceMappingURL=.*\s*$/, "")
		}
		for (var i = 0; i < result.diagnostics.length; i++) {
			const diagnostic = result.diagnostics[i]
			const startLoc = diagnostic.file && diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
			const endLoc = diagnostic.file && diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start + diagnostic.length)
			file.addError({
				source: TS.name,
				message: diagnostic.messageText,
				fileName: diagnostic.file ? diagnostic.file.fileName : options.fileName,
				line: startLoc && startLoc.line,
				column: startLoc && startLoc.character,
				endLine: endLoc && endLoc.line,
				endColumn: endLoc && endLoc.character
			})
		}
		file.content = result.outputText
		file.applySourceMap(result.sourceMapText)
	}
}