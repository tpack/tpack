import { readFileSync } from "fs"
import { Builder } from "../core/builder"
import { Bundler } from "../core/bundler"
import { Module, ModuleDependencyType } from "../core/module"
import { decodeHTML, encodeHTML, quoteHTMLAttribute } from "../utils/html"
import { TextDocument } from "../utils/textDocument"
import { BundlerOptions, TextBundler, TextModule } from "./common"

/** 表示一个 HTML 模块打包器 */
export default class HTMLBundler extends TextBundler implements Bundler {

	/**
	 * 初始化新的打包器
	 * @param options 构建器的选项
	 * @param builder 所属的构建器
	 */
	constructor(options: HTMLBundlerOptions = {}, builder: Builder) {
		super(options, builder)
		const htmlOptions = options.html || {}
		this.script = htmlOptions.js !== undefined ? htmlOptions.js : ".jsx"
		this.style = htmlOptions.css !== undefined ? htmlOptions.css : ".css"
		this.include = htmlOptions.include !== false

		loadTags(JSON.parse(readFileSync(`${__dirname}/../configs/tags.json`, "utf-8")), this.tags)
		loadTags(htmlOptions.tags, this.tags)
		function loadTags(src: Exclude<HTMLBundlerOptions["html"], undefined>["tags"], dest: HTMLBundler["tags"]) {
			for (const tagName in src) {
				const attrNames = src[tagName]
				if (attrNames === false) {
					dest[tagName] = false
					continue
				}
				const map = dest[tagName] || (dest[tagName] = Object.create(null))
				for (const attrName in attrNames) {
					const attrType = attrNames[attrName]
					// @ts-ignore
					map[attrName] = typeof attrType === "string" ? AttrType[attrType] : attrType
				}
			}
		}
	}

	/**
	 * 解析指定的文本模块
	 * @param document 要解析的文档
	 * @param module 要解析的模块
	 * @param builder 当前的构建器对象
	 */
	protected parseDocument(document: TextDocument, module: TextModule, builder: Builder) {
		module.sourceMap = false
		module.content.replace(/<!--(.*?)(?:-->|$)|<!\[CDATA\[.*?(?:\]\]>|$)|<%.*?(?:%>|$)|<\?.*?(?:\?>|$)|(<script\b(?:'[^']*'|"[^"]*"|[^>])*(?!\/)>)(.*?)(?:<\/script(?:'[^']*'|"[^"]*"|[^>])*>|$)|(<style\b(?:'[^']*'|"[^"]*"|[^>])*(?!\/)>)(.*?)(?:<\/style(?:'[^']*'|"[^"]*"|[^>])*>|$)|<([^\s!'">]+)\b(?:'[^']*'|"[^"]*"|[^>])*>/igs, (source: string, comment: string | undefined, openScript: string | undefined, script: string | undefined, openStyle: string | undefined, style: string | undefined, tagName: string | undefined, index: number) => {
			// <img>, <link>, ...
			if (tagName !== undefined) {
				this.parseTag(source, tagName.toLowerCase(), undefined, index, document, module)
				return ""
			}
			// <!-- -->
			if (comment !== undefined) {
				this.parseComment(source, comment, index, module)
				return ""
			}
			// <script>
			if (openScript !== undefined) {
				this.parseTag(openScript, "script", this.script ? script : undefined, index, document, module)
				return ""
			}
			// <style>
			if (openStyle !== undefined) {
				this.parseTag(openStyle, "style", this.style ? style : undefined, index, document, module)
				return ""
			}
			return ""
		})
	}

	/** 获取各标签的处理方式 */
	readonly tags: { [tagName: string]: { [attrName: string]: AttrType } | false } = Object.create(null)

	/** 脚本的默认语言 */
	readonly script: string | false

	/** 样式的默认语言 */
	readonly style: string | false

	/**
	 * 解析一个 HTML 标签
	 * @param openTag 要解析的打开标签源码
	 * @param tagName 要解析的标签名
	 * @param innerHTML 标签的主体，仅标签名为 `script` 或 `style` 时可用
	 * @param index 打开标签在源文件的起始位置（从 0 开始）
	 * @param document 当前正在解析的文档
	 * @param module 当前正在解析的模块
	 */
	protected parseTag(openTag: string, tagName: string, innerHTML: string | undefined, index: number, document: TextDocument, module: TextModule) {
		// 判断是否禁止解析当前标签
		const attrNames = this.tags[tagName]
		if (attrNames === false) {
			return
		}
		// 解析属性
		let langAttr: { source: string, sourceIndex: number, value: string } | undefined
		let relAttr: { source: string, sourceIndex: number, value: string } | undefined
		openTag.replace(/\s*([^\s='"]+)\s*=\s*("([^"]*)"|'([^']*)'|[^\s>]*)/g, (attrSource: string, attrName: string, attrString: string, attrString2: string | undefined, attrString3: string | undefined, attrSourceIndex: number) => {
			// 不处理含服务端代码的属性
			if (/<%.*%>|<\?.*\?>/.test(attrString)) {
				return ""
			}
			// 判断是否禁止解析当前属性
			const attrKey = attrName.toLowerCase()
			let attrType = attrNames ? attrNames[attrKey] : undefined
			if (attrType === undefined) attrType = (this.tags["*"] || Object.create(null))[attrKey]
			if (!attrType) {
				return ""
			}
			// 计算属性值
			const quote = attrString2 !== undefined ? '"' : attrString3 !== undefined ? "'" : ""
			const attrValue = attrString2 !== undefined ? attrString2 : attrString3 !== undefined ? attrString3 : attrString
			const attrValueIndex = index + attrSourceIndex + attrSource.length - attrString.length
			const attrValueEndIndex = attrValueIndex + attrString.length
			const decodedValue = decodeHTML(attrValue)
			// 处理属性
			switch (attrType) {
				case AttrType.url:
					this.parseURL(decodedValue, attrValueIndex, attrValueEndIndex, attrKey, module, url => quoteHTMLAttribute(url, quote))
					break
				case AttrType.script:
					if (this.script) {
						this.parseSubmodule(decodedValue, this.script, attrValueIndex, attrValueEndIndex, attrKey, module, content => quoteHTMLAttribute(content, quote))
					}
					break
				case AttrType.style:
					if (this.style) {
						this.parseSubmodule(decodedValue, this.style, attrValueIndex, attrValueEndIndex, attrKey, module, content => quoteHTMLAttribute(content, quote))
					}
					break
				case AttrType.scriptURL:
					if (innerHTML !== undefined) {
						const dependency = module.addDependency({
							type: ModuleDependencyType.reference,
							url: decodedValue,
							index: attrValueIndex,
							endIndex: attrValueEndIndex,
							source: attrKey
						})
						document.replace(index, index + openTag.length + innerHTML.length, (module: Module, builder: Builder) => {
							const result = new TextDocument(openTag)
							const resolvedFile = dependency.resolvedFile
							if (resolvedFile && dependency.inline) {
								// 删除 src 属性
								result.remove(attrSourceIndex, attrSourceIndex + attrSource.length)
								// 如果内联的脚本存在 </script> 会影响 HTML
								result.append(resolvedFile.content.replace(/<\/script>/ig, "<\\/script>"))
							} else {
								result.replace(attrValueIndex - index, attrValueEndIndex - index, quoteHTMLAttribute(this.buildURL(dependency, module, builder), quote))
							}
							return result
						})
						innerHTML = undefined
						break
					}
					this.parseURL(decodedValue, attrValueIndex, attrValueEndIndex, attrKey, module, url => quoteHTMLAttribute(url, quote))
					break
				case AttrType.styleURL:
					// 将 <link ...> 模拟成 <style ...>
					const link = tagName === "link"
					if (link) {
						tagName = "style"
						innerHTML = ""
					}
					if (innerHTML !== undefined) {
						const dependency = module.addDependency({
							type: ModuleDependencyType.reference,
							url: decodedValue,
							index: attrValueIndex,
							endIndex: attrValueEndIndex,
							source: attrKey
						})
						document.replace(index, index + openTag.length + innerHTML.length, (module: Module, builder: Builder) => {
							const result = new TextDocument(openTag)
							const resolvedFile = dependency.resolvedFile
							if (resolvedFile && dependency.inline) {
								if (link) {
									if (relAttr && relAttr.value === "stylesheet") {
										// "<link" -> "<style"
										result.replace(0, 5, "<style")
										// 删除 href 属性
										result.remove(attrSourceIndex, attrSourceIndex + attrSource.length)
										// 删除 rel 属性
										result.remove(relAttr.sourceIndex, relAttr.sourceIndex + relAttr.source.length)
										// 删除 />
										if (openTag.endsWith("/>")) {
											result.remove(openTag.length - 2, openTag.length - 1)
										}
										// 如果内联的脚本存在 </style> 会影响 HTML
										result.append(resolvedFile.content.replace(/<\/style>/ig, "<\\/style>"))
										result.append("</style>")
									} else {
										result.replace(attrValueIndex - index, attrValueEndIndex - index, quoteHTMLAttribute(this.buildURL(dependency, module, builder), quote))
									}
								} else {
									// 删除 src 属性
									result.remove(attrSourceIndex, attrSourceIndex + attrSource.length)
									result.append(resolvedFile.content.replace(/<\/style>/ig, "<\\/style>"))
								}
							} else {
								result.replace(attrValueIndex - index, attrValueEndIndex - index, quoteHTMLAttribute(this.buildURL(dependency, module, builder), quote))
							}
							return result
						})
						innerHTML = undefined
						break
					}
					this.parseURL(decodedValue, attrValueIndex, attrValueEndIndex, attrKey, module, url => quoteHTMLAttribute(url, quote))
					innerHTML = undefined
					break
				case AttrType.lang:
					langAttr = {
						source: attrSource,
						sourceIndex: attrSourceIndex,
						value: decodedValue
					}
					break
				case AttrType.rel:
					relAttr = {
						source: attrSource,
						sourceIndex: attrSourceIndex,
						value: decodedValue
					}
					break
				case AttrType.urlSet:
					// http://www.webkit.org/demos/srcset/
					// <img src="image-src.png" srcset="image-1x.png 1x, image-2x.png 2x, image-3x.png 3x, image-4x.png 4x">
					attrValue.replace(/(?=(?:^|,)\s*)(.*?)\s+\dx/g, (urlSource: string, url: string, urlSourceIndex: number) => {
						const startIndex = attrValueIndex + urlSourceIndex
						this.parseURL(decodeHTML(url), startIndex, startIndex + url.length, attrKey, module, encodeHTML)
						return ""
					})
					break
			}
			return ""
		})
		// 解析内联内容
		if (innerHTML !== undefined) {
			// 删除 "lang=..."
			if (langAttr) {
				document.remove(index + langAttr.sourceIndex, index + langAttr.sourceIndex + langAttr.source.length)
			}
			let innerHTMLIndex = index + openTag.length
			// 忽略 CDATA 和 注释
			const match = /^\s*<!(?:--|\[CDATA\[)/.exec(innerHTML)
			if (match) {
				innerHTMLIndex += match[0].length
				innerHTML = innerHTML.substring(match[0].length).replace(/(?:-->|\]\]>)?\s*$/, "")
			}
			this.parseSubmodule(innerHTML, langAttr && langAttr.value ? `.${langAttr.value}` : (tagName === "script" ? this.script as string : this.style as string), innerHTMLIndex, innerHTMLIndex + innerHTML.length, tagName, module)
		}
	}

	/** 判断是否解析 <!-- #include --> */
	readonly include: boolean

	/**
	 * 解析一个 HTML 注释
	 * @param comment 要解析的片段源码
	 * @param content 要解析的标签内容
	 * @param index HTML 注释在源文件的起始索引（从 0 开始）
	 * @param document 当前正在解析的文档
	 * @param module 当前正在解析的模块
	 */
	protected parseComment(comment: string, content: string, index: number, module: TextModule) {
		if (!this.include) {
			return
		}
		content.replace(/#include\s*(?:\w+\=)?('([^'\r\n]*)'|"([^"\r\n]*)"|\S*)/g, (source, url: string, url2: string | undefined, url3: string | undefined, sourceIndex: number) => {
			const include = url2 !== undefined ? url2 : url3 !== undefined ? url3 : url
			if (include) {
				const urlIndex = index + 4 /* "<!--".length */ + sourceIndex + source.length - url.length
				this.parseInclude(include, urlIndex, urlIndex + url.length, "#include", index, index + comment.length, module)
			}
			return ""
		})
	}

}

/** 表示 HTML 模块打包器的选项 */
export interface HTMLBundlerOptions extends BundlerOptions {
	/** 指定打包 HTML 的选项 */
	html?: {
		/**
		 * 指定不同属性的处理方式，如果属性名为 `"*"`，表示匹配所有标签
		 */
		tags?: { [tagName: string]: { [attrName: string]: keyof typeof AttrType | AttrType | false } | false }
		/**
		 * 是否解析 <!-- #include -->
		 * @default true
		 */
		include?: boolean
		/**
		 * 指定内联脚本及无语言标识的脚本语言，指定为 false 则不处理
		 * @default ".jsx"
		 */
		js?: string | false,
		/**
		 * 指定内联样式及无语言标识的样式语言，指定为 false 则不处理
		 * @default ".css"
		 */
		css?: string | false
	}
}

/** 表示属性的解析类型 */
export const enum AttrType {
	/** 普通文本 */
	plainText,
	/** 属性值是一个链接 */
	url,
	/** 属性值是一个链接集合 */
	urlSet,
	/** 属性值是一段脚本 */
	script,
	/** 属性值是一个脚本地址 */
	scriptURL,
	/** 属性值是一段样式 */
	style,
	/** 属性值是一个样式地址 */
	styleURL,
	/** 属性值是一个语言标识 */
	lang,
	/** 属性值是一个 rel 标识 */
	rel,
}