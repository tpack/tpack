import { Builder } from "../core/builder"
import { Processor } from "../core/options"
import { VFile } from "../core/vfile"
import { Compiler } from "./common"

export default class Markdown extends Compiler implements Processor {
	get outExt() { return ".html" }
	get vendorName() { return "marked" }
	async init(marked: any, options: any, builder: Builder) {
		options = {
			tpl: '<!DOCTYPE html>\n\
<html>\n\
<head>\n\
	<meta charset="utf-8" />\n\
	<meta name="viewport" content="width=device-width,minimum-scale=1.0,maximum-scale=1.0,user-scalable=no" />\n\
	<title></title>\n\
</head>\n\
<body>\n\
</body>\n\
</html>',
			title: true,
			highlight: true,
			...options
		}
		if (options.highlight && typeof options.highlight !== "function") {
			const highLighter = await builder.require("highlight.js")
			if (options.highlight !== true) {
				highLighter.configure(options.highlight)
			}
			options.highlight = (code: string, lang: string) => (lang ? highLighter.highlight(lang, code, true) : highLighter.highlightAuto(code)).value
		}
		return options
	}
	async compile(file: VFile, options: any, marked: any) {
		file.ext = ".html"
		let content = marked(file.content, options)
		if (options.tpl) {
			content = /<\/body[^>]*>/i.test(options.tpl) ? options.tpl.replace(/<\/body[^>]*>/i, content + '\n$&') : options.tpl + content;
		}
		if (options.title === true) options.title = (/<h1[^>]*>(.*?)<\/h1[^>]*>/i.exec(content) || [])[1];
		if (options.title) {
			content = /<title[^>]*>(.*)<\/title[^>]*>/i.test(content) ? content.replace(/(<title[^>]*>)(.*)(<\/title[^>]*>)/i, "$1" + options.title + "$3") :
				/<head[^>]*>/i.test(content) ? content.replace(/<head[^>]*>/i, "$&<title>" + options.title + "</title>") :
					"<title>" + options.title + "</title>" + content;
		}
		file.content = content
	}
}