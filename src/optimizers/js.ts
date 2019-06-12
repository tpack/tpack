import { Processor } from "../core/options"
import { VFile } from "../core/vfile"
import { Builder } from "../core/builder"
import { Compiler } from "../compilers/common"

export default class UglifyJS extends Compiler implements Processor {
	get vendorName() { return "uglify-js" }
	compile(file: VFile, options: any, uglifyJS: any, builder: Builder) {
		const result = uglifyJS.minify(file.content, merge(options, {
			sourceMap: builder.sourceMap ? {
				content: file.sourceMapObject
			} : false,
			ie8: true,
			parse: {
				filename: file.originalPath
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
			file.addError({
				source: UglifyJS.name,
				message: result.error.message,
				line: result.error.line == undefined ? undefined : result.error.line - 1,
				column: result.error.col,
				error: result.error,
			})
		}
		if (result.warnings) {
			for (const warning of result.warnings) {
				const match = /\s*\[\d+:(\d+),(\d+)\]$/.exec(warning)
				file.addWarning({
					source: UglifyJS.name,
					message: match ? warning.substring(0, match.index) : warning,
					line: match ? +match[1] : undefined,
					column: match ? +match[2] : undefined
				})
			}
		}
		file.content = result.code
		if (result.map) {
			const map = JSON.parse(result.map)
			map.sources[0] = file.originalPath
			file.sourceMapObject = map
		} else {
			file.sourceMapObject = undefined
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