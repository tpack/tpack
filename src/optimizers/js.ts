import { Builder } from "../core/builder"
import { Module } from "../core/module"
import { Processor } from "../core/processor"
import { Compiler } from "../compilers/common"

export default class UglifyJS extends Compiler implements Processor {
	get vendorName() { return "uglify-js" }
	compile(module: Module, options: any, uglifyJS: any, builder: Builder) {
		const result = uglifyJS.minify(module.content, merge(options, {
			sourceMap: builder.sourceMap ? {
				content: module.sourceMapObject
			} : false,
			ie8: true,
			parse: {
				filename: module.originalPath
			},
			compress: {
				drop_console: true,
				dead_code: true,
				drop_debugger: true,
				global_defs: {
					DEBUG: false,
					RELEASE: true
				}
			},
			output: {
				comments: /^!|@preserve|@license|@cc_on/
			}
		}))
		if (result.error) {
			module.addError({
				message: result.error.message,
				line: result.error.line == undefined ? undefined : result.error.line - 1,
				column: result.error.col
			})
		}
		if (result.warnings) {
			for (const warning of result.warnings) {
				const match = /\s*\[\d+:(\d+),(\d+)\]$/.exec(warning)
				module.addWarning({
					message: match ? warning.substring(0, match.index) : warning,
					line: match ? +match[1] : undefined,
					column: match ? +match[2] : undefined
				})
			}
		}
		module.content = result.code
		if (result.map) {
			const map = JSON.parse(result.map)
			map.sources[0] = module.originalPath
			module.sourceMapObject = map
		} else {
			module.sourceMapObject = undefined
		}
	}
}

function merge(src: any, dest: any) {
	for (var key in src) {
		if (src[key] && dest[key] && typeof src[key] === "object" && typeof dest[key] === "object") {
			merge(dest[key], src[key])
		} else {
			dest[key] = src[key]
		}
	}
	return dest
}