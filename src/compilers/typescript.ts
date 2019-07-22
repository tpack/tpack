import { resolve } from "path"
import { Builder } from "../core/builder"
import { Module } from "../core/module"
import { Processor } from "../core/processor"
import { Compiler } from "./common"

/** 表示一个 TypeScript 插件 */
export default class TS extends Compiler implements Processor {
	get outExt() { return ".js" }
	get vendorName() { return "typescript" }
	static parallel = true
	compile(module: Module, options: any, ts: any, builder: Builder) {
		// 忽略 .d.ts 文件
		if (/\.d\.ts$/i.test(module.originalPath)) {
			module.content = ""
			return
		}
		// 设置默认值
		if (typeof options === "string") {
			options = require(resolve(options)).compilerOptions
		}
		options = {
			compilerOptions: Object.assign({
				sourceMap: module.sourceMap,
				charset: builder.encoding,
				experimentalDecorators: true,
				newLine: "LF",
				jsx: /x$/i.test(module.originalPath) ? 2/*React*/ : 1/*Preserve*/
			}, options),
			fileName: module.originalPath,
			reportDiagnostics: true
		}
		delete options.compilerOptions.outDir

		const result = ts.transpileModule(module.content, options)
		if (result.sourceMapText) {
			// TS 未提供 API 以删除 # sourceMappingURL，手动删除之。
			result.outputText = result.outputText.replace(/\/\/# sourceMappingURL=.*\s*$/, "")
		}
		// TODO: .d.ts 生成
		for (const diagnostic of result.diagnostics) {
			const startLoc = diagnostic.file && diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
			const endLoc = diagnostic.file && diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start + diagnostic.length)
			module.addError({
				message: diagnostic.messageText,
				fileName: diagnostic.file ? diagnostic.file.fileName : options.fileName,
				line: startLoc && startLoc.line,
				column: startLoc && startLoc.character,
				endLine: endLoc && endLoc.line,
				endColumn: endLoc && endLoc.character
			})
		}
		module.content = result.outputText
		module.applySourceMap(result.sourceMapText)
	}
}