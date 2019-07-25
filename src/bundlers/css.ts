import { Builder } from "../core/builder"
import { Bundler as IBundler } from "../core/bundler"
import { decodeCSS, quoteCSSString } from "../utils/css"
import { TextDocument } from "../utils/textDocument"
import { BundlerOptions, TextBundler, TextModule } from "./common"

/** 表示一个 CSS 模块打包器 */
export default class CSSBundler extends TextBundler implements IBundler {

	/**
	 * 初始化新的打包器
	 * @param options 构建器的选项
	 * @param builder 所属的构建器
	 */
	constructor(options: CSSBundlerOptions = {}, builder: Builder) {
		super(options, builder)
		const cssOptions = options.css || {}
		this.import = cssOptions.import !== undefined ? cssOptions.import : true
		this.url = cssOptions.url !== false
	}

	/**
	 * 解析指定的文本模块
	 * @param document 要解析的文档
	 * @param module 要解析的模块
	 * @param builder 当前的构建器对象
	 */
	protected parseDocument(document: TextDocument, module: TextModule, builder: Builder) {
		document.content.replace(/\/\*(.*?)(?:\*\/|$)|((?:@import\s+url|\burl)\s*\(\s*)("((?:[^\\"\n\r]|\\.)*)"|'((?:[^\\'\n\r]|\\.)*)'|[^\)\n\r]*)\s*\)\s*(?:;\s*(?:\r\n?|\n)?)?/gs, (source, comment: string | undefined, urlPrefix: string | undefined, urlString1: string | undefined, urlString2: string | undefined, urlString3: string | undefined, sourceIndex: number) => {
			// /* ... */
			if (comment != undefined) {
				return ""
			}
			// @import url(...);, url(...)
			if (urlPrefix != undefined) {
				// 提取引号内的内容。
				const quote = urlString2 !== undefined ? '"' : urlString3 !== undefined ? "'" : undefined
				const urlString = urlString2 !== undefined ? urlString2 : urlString3 !== undefined ? urlString3 : urlString1!
				const urlIndex = sourceIndex + urlPrefix.length
				const url = decodeCSS(urlString)
				if (urlPrefix.charCodeAt(0) === 64 /*@*/) {
					// @import url(...);
					this.parseImport(source, sourceIndex, url, urlIndex, urlIndex + urlString1!.length, quote, module)
				} else {
					// url(...)
					this.parseURLCall(url, urlIndex, urlIndex + urlString1!.length, quote, module)
				}
				return ""
			}
			return ""
		})
	}

	/**
	 * 是否合并 `@import`
	 * - `true`: 合并模块
	 * - `"url"`: 仅处理地址
	 * - `false`: 忽略
	 * @default true
	 */
	readonly import?: boolean | "url"

	/**
	 * 解析一个 `@import` 片段。
	 * @param url 要解析的地址
     * @param startIndex 地址在源文件的开始索引
     * @param endIndex 地址在源文件的结束索引（不含）
	 * @param quote 最终地址的引号
	 * @param module 地址所在的模块
	*/
	parseImport(importSource: string, importSourceIndex: number, url: string, startIndex: number, endIndex: number, quote: string | undefined, module: TextModule) {
		if (!this.import) {
			return
		}
		if (this.import === true) {
			const dependency = module.addDependency({
				url: url,
				index: startIndex,
				endIndex: endIndex,
				source: "import"
			})
			return
		}
		this.parseURL(url, startIndex, endIndex, "import", module, content => quoteCSSString(content, quote))
	}

	/** 判断是否解析 `url()` */
	readonly url: boolean

	/**
     * 解析一个 `url(...)` 片段
	 * @param url 要解析的地址
     * @param startIndex 地址在源文件的开始索引
     * @param endIndex 地址在源文件的结束索引（不含）
	 * @param quote 最终地址的引号
	 * @param module 地址所在的模块
     */
	protected parseURLCall(url: string, startIndex: number, endIndex: number, quote: string | undefined, module: TextModule) {
		if (!this.url) {
			return
		}
		this.parseURL(url, startIndex, endIndex, "url", module, content => quoteCSSString(content, quote))
	}

}

/** 表示 CSS 模块打包器的选项 */
export interface CSSBundlerOptions extends BundlerOptions {
	/** 指定打包 CSS 的选项 */
	css?: {
		/**
		 * 是否合并 `@import`
		 * - `true`: 合并模块
		 * - `"url"`: 仅处理地址
		 * - `false`: 忽略
		 * @default true
		 */
		import?: boolean | "url"
		/**
		 * 是否解析 `url()`
		 * @default true
		 */
		url?: boolean
	}
}