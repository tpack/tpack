import { Processor } from "../core/options"
import { VFile } from "../core/vfile"
import { Compiler } from "../compilers/common"

export default class HtmlMinifier extends Compiler implements Processor {
	get vendorName() { return "html-minifier" }
	compile(file: VFile, options: any, htmlMinifier: any) {
		try {
			file.content = htmlMinifier.minify(file.content, {
				collapseWhitespace: true,
				removeComments: true,
				minifyJS: true,
				minifyCSS: true,
				...options
			})
		} catch (e) {
			file.addError({
				source: HtmlMinifier.name,
				error: e,
				message: e.message
			})
		}
	}
}