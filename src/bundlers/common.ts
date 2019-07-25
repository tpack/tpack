import { readFileSync } from "fs"
import { dirname, resolve } from "path"
import { stringify as stringifyQuery } from "querystring"
import { format as formatURL, parse as parseURL } from "url"
import { Builder } from "../core/builder"
import { Bundler } from "../core/bundler"
import { i18n } from "../core/i18n"
import { Module, ModuleDependency, ModuleDependencyType } from "../core/module"
import { Resolver, ResolverOptions } from "../core/resolver"
import { encodeDataURI } from "../utils/base64"
import { getDir, isAbsolutePath, relativePath } from "../utils/path"
import { TextDocument } from "../utils/textDocument"

/** 表示一个文本模块依赖打包器 */
export abstract class TextBundler implements Bundler {

	// #region 选项

	/**
	 * 初始化新的打包器
	 * @param options 构建器的选项
	 * @param builder 所属的构建器
	 */
	constructor(options: BundlerOptions, builder: Builder) {
		const resolveOptions = options.resolve || {}
		this.resolveOptions = {
			inlineQuery: resolveOptions.inlineQuery !== undefined ? resolveOptions.inlineQuery : "inline",
			noCheckQuery: resolveOptions.noCheckQuery !== undefined ? resolveOptions.noCheckQuery : "nocheck",
			resolver: resolveOptions.type === "node" ? new Resolver(resolveOptions, builder.fs) : undefined,
			builtinModules: resolveOptions.type === "node" ? Object.setPrototypeOf(Object.assign(JSON.parse(readFileSync(`${__dirname}/../configs/builtinModules.json`, "utf-8")), resolveOptions.builtinModules), null) : undefined,
			before: resolveOptions.before,
			enforceCaseSensitive: resolveOptions.enforceCaseSensitive,
			after: resolveOptions.after,
		}
		const outputOptions = options.output || {}
		this.outputOptions = {
			formatPath: outputOptions.formatURLPath || (outputOptions.publicURL != undefined ? (dependencyModule, module, builder) => outputOptions.publicURL + builder.relativePath(dependencyModule.path) : (dependencyModule, module) => relativePath(getDir(module.path), dependencyModule.path)),
			formatURL: outputOptions.formatURL || (dependency => formatURL(dependency)),
			prepend: typeof outputOptions.prepend === "string" ? (module, builder) => builder.formatPath(outputOptions.prepend as string, module) : outputOptions.prepend,
			append: typeof outputOptions.append === "string" ? (module, builder) => builder.formatPath(outputOptions.append as string, module) : outputOptions.append,
			modulePrepend: typeof outputOptions.modulePrepend === "string" ? (module, _, builder) => builder.formatPath(outputOptions.modulePrepend as string, module) : outputOptions.modulePrepend,
			moduleAppend: typeof outputOptions.moduleAppend === "string" ? (module, _, builder) => builder.formatPath(outputOptions.moduleAppend as string, module) : outputOptions.moduleAppend,
			moduleSeparator: outputOptions.moduleSeparator != undefined ? outputOptions.moduleSeparator : "\n\n",
			indentString: outputOptions.indentString != undefined ? outputOptions.indentString : "  ",
			newLine: outputOptions.newLine != undefined ? outputOptions.newLine : "\n"
		}
	}

	// #endregion

	// #region 解析

	/**
	 * 解析指定的模块
	 * @param module 要解析的模块
	 * @param builder 当前的构建器对象
	 */
	parse(module: TextModule, builder: Builder) {
		return this.parseDocument(module.document = new TextDocument(module.content, module.originalPath, module.sourceMapData), module, builder)
	}

	/**
	 * 解析指定的文本模块
	 * @param document 要解析的文档
	 * @param module 要解析的模块
	 * @param builder 当前的构建器对象
	 */
	protected abstract parseDocument(document: TextDocument, module: TextModule, builder: Builder): void | Promise<void>

	/**
	 * 解析模块中的一个依赖地址
	 * @param url 要解析的地址
     * @param startIndex 地址在源文件的开始索引
     * @param endIndex 地址在源文件的结束索引（不含）
	 * @param source 依赖的类型
	 * @param module 地址所在的模块
	 * @param formatter 格式化输出内容的函数
	 * @param formatter.content 要格式化的内容
	 * @param formatter.module 最终生成的目标模块
	 * @param formatter.builder 当前的构建器对象
	 */
	protected parseURL(url: string, startIndex: number, endIndex: number, source: string, module: TextModule, formatter?: (content: string, module: Module, builder: Builder) => string) {
		const dependency = module.addDependency({
			type: ModuleDependencyType.reference,
			url: url,
			index: startIndex,
			endIndex: endIndex,
			source: source,
		})
		module.document.replace(startIndex, endIndex, (module: Module, builder: Builder) => {
			const url = this.buildURL(dependency, module, builder)
			return formatter ? formatter(url, module, builder) : url
		})
	}

	/**
	 * 解析要包含的模块
	 * @param url 要解析的包含地址
     * @param startIndex 地址在源文件的开始索引
     * @param endIndex 地址在源文件的结束索引（不含）
	 * @param source 依赖的类型
	 * @param replaceStartIndex 源文件需要替换的开始索引
	 * @param replaceEndIndex 源文件需要替换的结束索引（不含）
	 * @param module 地址所在的模块
	 */
	protected parseInclude(url: string, startIndex: number, endIndex: number, source: string, replaceStartIndex: number, replaceEndIndex: number, module: TextModule) {
		const dependency = module.addDependency({
			type: ModuleDependencyType.reference,
			url: url,
			index: startIndex,
			endIndex: endIndex,
			inline: true,
			source: source,
		})
		module.document.replace(replaceStartIndex, replaceEndIndex, (generatedModule: Module, builder: Builder) => {
			const dependencyModule = dependency.module as TextModule
			if (!dependencyModule) {
				return module.content.substring(replaceStartIndex, replaceEndIndex)
			}
			if (dependency.circular) {
				generatedModule.addError({
					message: `Circular include '${builder.logger.formatPath(dependencyModule.originalPath)}'`,
					index: dependency.index,
					endIndex: dependency.endIndex
				})
				return module.content.substring(replaceStartIndex, replaceEndIndex)
			}
			return dependencyModule.document || dependencyModule.content
		})
	}

	/**
	 * 解析内联的独立模块
	 * @param content 要解析的源码内容
	 * @param ext 源码的扩展名（含点）
	 * @param startIndex 子模块在源模块的开始索引
	 * @param endIndex 子模块在源模块的结束索引（不含）
	 * @param source 依赖的类型
	 * @param module 子模块所在的模块
	 * @param formatter 格式化输出内容的函数
	 * @param formatter.content 要格式化的内容
	 * @param formatter.module 最终生成的目标模块
	 * @param formatter.builder 当前的构建器对象
	 */
	protected parseSubmodule(content: string, ext: string, startIndex: number, endIndex: number, source: string, module: TextModule, formatter?: (content: string, module: Module, builder: Builder) => string) {
		const dependency = module.addDependency({
			type: ModuleDependencyType.reference,
			module: module.createSubmodule(`${source}-${startIndex}${ext}`, content, startIndex),
			index: startIndex,
			endIndex: endIndex,
			inline: true,
			source: source,
		})
		module.document.replace(startIndex, endIndex, formatter ? (containingFile: Module, builder: Builder) => formatter(dependency.module!.content, containingFile, builder) : () => dependency.module!.content)
	}

	// #endregion

	// #region 解析地址

	/** 所有可用的模块依赖解析器 */
	readonly resolveOptions: {
		/** 获取用于标记不检查指定地址的查询参数名 */
		readonly noCheckQuery?: string | false
		/** 获取用于标记内联引用的查询参数名 */
		readonly inlineQuery?: string | false
		/**
		 * 在解析依赖之前的回调函数
		 * @param dependency 要解析的依赖项
		 * @param module 当前地址所在的模块
		 * @param builder 当前的构建器对象
		 */
		readonly before?: (dependency: ModuleDependency, module: Module, builder: Builder) => void | Promise<void>
		/** 模块路径解析器，如果为 `undefined` 则只按相对路径解析 */
		readonly resolver?: Resolver
		/** 所有内置模块 */
		readonly builtinModules?: {
			[name: string]: string | false
		}
		/** 是否强制区分路径大小写 */
		readonly enforceCaseSensitive?: boolean
		/**
		 * 在解析依赖之后的回调函数
		 * @param dependency 要解析的依赖项
		 * @param module 当前地址所在的模块
		 * @param builder 当前的构建器对象
		 */
		readonly after?: (dependency: ModuleDependency, module: Module, builder: Builder) => void | Promise<void>
	}

	/**
	 * 解析指定的依赖
	 * @param dependency 要解析的依赖项
	 * @param module 当前地址所在的文件
	 * @param builder 当前的构建器对象
	 */
	async resolve(dependency: ModuleURLDependency, module: Module, builder: Builder) {
		const resolveOptions = this.resolveOptions
		// 支持 ?nocheck&inline
		const url = parseURL(dependency.url!, true, true)
		dependency.protocol = url.protocol
		dependency.slashes = url.slashes
		dependency.auth = url.auth
		dependency.host = url.host
		dependency.pathname = url.pathname
		dependency.search = url.search
		dependency.query = url.query
		dependency.hash = url.hash
		if (url.search) {
			if (resolveOptions.noCheckQuery) {
				const noCheck = dependency.query[resolveOptions.noCheckQuery]
				if (noCheck !== undefined) {
					delete dependency.query[resolveOptions.noCheckQuery]
					dependency.search = stringifyQuery(dependency.query)
				}
				if (noCheck === "" || noCheck === "true") {
					return false
				}
			}
			if (resolveOptions.inlineQuery) {
				const inline = dependency.query[resolveOptions.inlineQuery]
				if (inline !== undefined) {
					delete dependency.query[resolveOptions.inlineQuery]
					dependency.search = stringifyQuery(dependency.query)
				}
				if (inline === "" || inline === "true") {
					dependency.inline = true
				} else if (inline === "false") {
					dependency.inline = false
				}
			}
		}
		// 完整解析流程
		if (resolveOptions.before) {
			await resolveOptions.before(dependency, module, builder)
		}
		let resolvedPath: string | null | false | undefined
		// 忽略绝对地址(http://..., javascript:..., /path/to/file...)
		if (!dependency.protocol && !dependency.slashes && dependency.pathname && !dependency.pathname.startsWith("/")) {
			const name = dependency.pathname!
			if (resolveOptions.resolver) {
				// 解析模块(node_modules)
				if (resolveOptions.builtinModules && (resolvedPath = resolveOptions.builtinModules[name]) !== undefined) {
					// 解析内置模块
					// 首次使用自动下载依赖
					if (resolvedPath && !isAbsolutePath(resolvedPath)) {
						resolveOptions.builtinModules[name] = resolvedPath = await builder.resolvePackage(resolvedPath, true)
					}
				} else {
					const containingDir = dirname(module.originalPath)
					if ((resolvedPath = await resolveOptions.resolver.resolve(name, containingDir)) === null) {
						// 自动安装文件
						await builder.installPackage(name)
						// 重新解析一次，收集错误原因
						const trace: string[] = []
						resolvedPath = await resolveOptions.resolver.resolve(name, containingDir, trace)
						dependency.detail = trace.join("\n")
					}
				}
			} else {
				// 解析相对路径
				resolvedPath = resolve(module.originalPath, "..", name)
				const realPath = await builder.fs.getRealPath(resolvedPath)
				if (realPath) {
					// 检查大小写
					if (resolveOptions.enforceCaseSensitive) {
						const baseDir = getDir(module.originalPath)
						const realUrl = relativePath(baseDir, realPath)
						const actualUrl = relativePath(baseDir, resolvedPath)
						if (realUrl !== actualUrl) {
							module.addWarning({
								message: i18n`Case mismatched: '${actualUrl}' should be '${realUrl}'`,
								index: dependency.index,
								endIndex: dependency.endIndex,
							})
						}
					}
					// 忽略文件夹
					if (await builder.fs.existsDir(resolvedPath)) {
						resolvedPath = false
					}
				} else {
					resolvedPath = null
				}
			}
		}
		if (resolveOptions.after) {
			await resolveOptions.after(dependency, module, builder)
			resolvedPath = dependency.path
		}
		return resolvedPath
	}

	// #endregion

	// #region 合成

	/**
	 * 合成指定的模块
	 * @param module 要合成的模块
	 * @param generatedModule 合成的目标模块
	 * @param builder 当前的构建器对象
	 */
	generate(module: TextModule, generatedModule: Module, builder: Builder) {
		if (module.sourceMap) {
			const result = module.document.generate(generatedModule, builder)
			generatedModule.content = result.content
			generatedModule.sourceMapBuilder = result.sourceMapBuilder
		} else {
			generatedModule.content = module.document.toString(generatedModule, builder)
		}
	}

	/** 模块输出的选项 */
	readonly outputOptions: {
		/**
		 * 计算最终在生成模块中引用其它模块的地址的回调函数
		 * @param dependencyModule 依赖的模块
		 * @param module 生成的目标模块
		 * @param builder 当前的构建器对象
		 * @returns 返回生成的地址
		 */
		readonly formatPath: (dependencyModule: Module, module: Module, builder: Builder) => string
		/**
		 * 计算在地址查询参数追加内容的回调函数
		 * @param dependencyModule 依赖的模块
		 * @param module 生成的目标模块
		 * @param builder 当前的构建器对象
		 * @returns 返回生成的查询参数
		 */
		readonly appendQuery?: (dependencyModule: Module, module: Module, builder: Builder) => string
		/**
		 * 计算最终在生成模块中引用其它模块的地址的回调函数
		 * @param dependency 依赖项
		 * @param module 生成的目标模块
		 * @param builder 当前的构建器对象
		 * @returns 返回生成的地址
		 */
		readonly formatURL: (dependency: ModuleURLDependency, module: Module, builder: Builder) => string
		/**
		 * 在最终合并生成的模块开头追加的内容
		 * @param module 要生成的模块
		 * @param builder 当前的构建器对象
		 * @example "/* This file is generated by tpack. DO NOT EDIT DIRECTLY!! *‌/"
		 */
		readonly prepend?: (module: Module, builder: Builder) => string
		/**
		 * 在最终合并生成的模块末尾追加的内容
		 * @param module 要生成的模块
		 * @param builder 当前的构建器对象
		 */
		readonly append?: (module: Module, builder: Builder) => string
		/**
		 * 在每个依赖模块开头追加的内容
		 * @param dependencyModule 引用的模块
		 * @param module 要生成的模块
		 * @param builder 当前的构建器对象
		 */
		readonly modulePrepend?: (dependencyModule: Module, module: Module, builder: Builder) => string
		/**
		 * 在每个依赖模块末尾追加的内容
		 * @param dependencyModule 引用的模块
		 * @param module 要生成的模块
		 * @param builder 当前的构建器对象
		 */
		readonly moduleAppend?: (dependencyModule: Module, module: Module, builder: Builder) => string
		/** 在每个依赖模块之间插入的代码 */
		readonly moduleSeparator?: string
		/** 生成的文件中用于缩进源码的字符串 */
		readonly indentString?: string
		/** 生成的文件中用于换行的字符串 */
		readonly newLine?: string
	}

	/**
	 * 获取指定依赖的最终引用地址
	 * @param dependency 依赖项
	 * @param module 生成的目标文件
	 * @param builder 当前的构建器对象
	 */
	protected buildURL(dependency: ModuleDependency, module: Module, builder: Builder) {
		const dependencyModule = dependency.module
		if (dependencyModule) {
			// 内联文件
			if (dependency.inline) {
				if (dependency.circular) {
					module.addError({
						message: `Circular inline '${builder.logger.formatPath(dependencyModule.originalPath)}'`,
						index: dependency.index,
						endIndex: dependency.endIndex
					})
				} else {
					return encodeDataURI(dependencyModule.type!, dependencyModule.buffer)
				}
			}
			// 格式化地址
			dependency = { ...dependency }
			dependency.pathname = this.outputOptions.formatPath(dependencyModule, module, builder)
			if (this.outputOptions.appendQuery) {
				const newQuery = this.outputOptions.appendQuery(dependencyModule, module, builder)
				dependency.search = dependency.search ? dependency.search + "&" + newQuery : newQuery
			}
		}
		return this.outputOptions.formatURL(dependency, module, builder)
	}

	// #endregion

}

/** 表示打包器的选项 */
export interface BundlerOptions {
	/** 指定解析模块的选项 */
	resolve?: {
		/**
		 * 解析路径的方式
		 * - `"relative"`: 采用相对地址解析
		 * - `"node"`: 采用和 Node.js 中 `require` 相同的方式解析
		 */
		type?: "relative" | "node"
		/**
		 * 用于标记不检查指定地址的查询参数名
		 * @default "nocheck"
		 */
		noCheckQuery?: string | false
		/**
		 * 用于标记内联引用的查询参数名
		 * @default "inline"
		 */
		inlineQuery?: string | false
		/** 所有内置模块 */
		readonly builtinModules?: { [name: string]: string | false }
		/**
		 * 在解析模块路径之前的回调函数
		 * @param dependency 要解析的依赖对象
		 * @param module 当前地址所在的模块
		 * @param builder 当前的构建器对象
		 */
		before?: (dependency: ModuleDependency, module: Module, builder: Builder) => void
		/**
		 * 在解析模块路径之后的回调函数
		 * @param dependency 要解析的依赖对象
		 * @param module 当前地址所在的模块
		 * @param builder 当前的构建器对象
		 */
		after?: (dependency: ModuleDependency, module: Module, builder: Builder) => void
	} & ResolverOptions
	/** 表示最终打包生成的选项 */
	output?: {
		/**
		 * 计算最终在生成模块中引用其它模块的地址的回调函数
	 	 * @param moduleDependency 依赖的文件
	 	 * @param module 生成的目标文件
	 	 * @param builder 当前的构建器对象
		 * @returns 返回生成的地址
		 */
		formatURLPath?: (moduleDependency: Module, module: Module, builder: Builder) => string
		/**
		 * 最终引用模块的根地址，一般以 `/` 结尾
		 * @description 如果需要使用 CDN，可配置成 CDN 的根地址，同时记得在发布后将相关文件上传到 CDN 服务器
		 * @default "/"
		 * @example "https://cdn.example.com/assets/"
		 */
		publicURL?: string
		/**
		 * 在地址查询参数追加的内容，如果是字符串，则其中以下标记会被替换：
		 * - `<path>`: 要生成的模块的相对路径，等价于 `<dir>/<name><ext>`
		 * - `<dir>`: 要生成的模块所在文件夹的相对路径
		 * - `<name>`: 要生成的模块的文件名（不含文件夹和扩展名部分）
		 * - `<ext>`: 要生成的模块的扩展名（含点）
		 * - `<md5>`: 要生成的模块内容的 MD5 串（小写），默认截取前 8 位，如果要截取前 n 位，使用 `<md5:n>`
		 * - `<sha1>`: 要生成的模块内容的 SHA-1 串（小写），默认截取前 8 位，如果要截取前 n 位，使用 `<sha1:n>`
		 * - `<date>`: 当前时间，默认为用户本地可读格式，如果要自定义格式，使用如 `<date:yyyyMMdd>`
		 * - `<random>`: 随机整数，默认为 8 位，如果要自定义为 n  位，使用如 `<rand:n>`
		 * - `<version>`: 构建器的版本号
	  	 * @param moduleDependency 依赖的文件
	  	 * @param module 生成的目标文件
	  	 * @param builder 当前的构建器对象
	  	 * @returns 返回生成的查询参数
		 */
		appendURLQuery?: string | ((moduleDependency: Module, module: Module, builder: Builder) => string)
		/**
		 * 自定义最终生成的模块引用其它模块的地址的回调函数
		 * @param dependency 依赖项
		 * @param module 生成的目标文件
		 * @param builder 当前的构建器对象
		 * @returns 返回生成的地址
		 */
		formatURL?: (dependency: ModuleURLDependency, module: Module, builder: Builder) => string
		/**
		 * 在最终合并生成的模块开头追加的内容，如果是字符串，则其中以下标记会被替换：
		 * - `<path>`: 要生成的模块的相对路径，等价于 `<dir>/<name><ext>`
		 * - `<dir>`: 要生成的模块所在文件夹的相对路径
		 * - `<name>`: 要生成的模块的文件名（不含文件夹和扩展名部分）
		 * - `<ext>`: 要生成的模块的扩展名（含点）
		 * - `<md5>`: 要生成的模块内容的 MD5 串（小写），默认截取前 8 位，如果要截取前 n 位，使用 `<md5:n>`
		 * - `<sha1>`: 要生成的模块内容的 SHA-1 串（小写），默认截取前 8 位，如果要截取前 n 位，使用 `<sha1:n>`
		 * - `<date>`: 当前时间，默认为用户本地可读格式，如果要自定义格式，使用如 `<date:yyyyMMdd>`
		 * - `<random>`: 随机整数，默认为 8 位，如果要自定义为 n  位，使用如 `<rand:n>`
		 * - `<version>`: 构建器的版本号
		 * @param module 要生成的模块
		 * @param builder 当前的构建器对象
		 * @example "/* This file is generated by <builder>. DO NOT EDIT DIRECTLY!! *‌/"
		 */
		prepend?: string | ((module: Module, builder: Builder) => string)
		/**
		 * 在最终合并生成的模块末尾追加的内容，如果是字符串，则其中以下标记会被替换：
		 * - `<path>`: 要生成的模块的相对路径，等价于 `<dir>/<name><ext>`
		 * - `<dir>`: 要生成的模块所在文件夹的相对路径
		 * - `<name>`: 要生成的模块的文件名（不含文件夹和扩展名部分）
		 * - `<ext>`: 要生成的模块的扩展名（含点）
		 * - `<md5>`: 要生成的模块内容的 MD5 串（小写），默认截取前 8 位，如果要截取前 n 位，使用 `<md5:n>`
		 * - `<sha1>`: 要生成的模块内容的 SHA-1 串（小写），默认截取前 8 位，如果要截取前 n 位，使用 `<sha1:n>`
		 * - `<date>`: 当前时间，默认为用户本地可读格式，如果要自定义格式，使用如 `<date:yyyyMMdd>`
		 * - `<random>`: 随机整数，默认为 8 位，如果要自定义为 n  位，使用如 `<random:n>`
		 * - `<version>`: 构建器的版本号
		 * @param module 要生成的模块
		 * @param builder 当前的构建器对象
		 */
		append?: string | ((module: Module, builder: Builder) => string)
		/**
		 * 在每个依赖模块开头追加的内容，如果是字符串，则其中以下标记会被替换：
		 * - `<path>`: 引用的模块的相对路径，等价于 `<dir>/<name><ext>`
		 * - `<dir>`: 引用的模块所在文件夹的相对路径
		 * - `<name>`: 引用的模块的文件名（不含文件夹和扩展名部分）
		 * - `<ext>`: 引用的模块的扩展名（含点）
		 * - `<md5>`: 引用的模块内容的 MD5 串（小写），默认截取前 8 位，如果要截取前 n 位，使用 `<md5:n>`
		 * - `<sha1>`: 引用的模块内容的 SHA-1 串（小写），默认截取前 8 位，如果要截取前 n 位，使用 `<sha1:n>`
		 * - `<date>`: 当前时间，默认为用户本地可读格式，如果要自定义格式，使用如 `<date:yyyyMMdd>`
		 * - `<random>`: 随机整数，默认为 8 位，如果要自定义为 n  位，使用如 `<random:n>`
		 * - `<version>`: 构建器的版本号
		 * @param moduleDependency 引用的模块
		 * @param module 要生成的模块
		 * @param builder 当前的构建器对象
		 */
		modulePrepend?: string | ((moduleDependency: Module, module: Module, builder: Builder) => string)
		/**
		 * 在每个依赖模块末尾追加的内容，如果是字符串，则其中以下标记会被替换：
		 * - `<path>`: 引用的模块的相对路径，等价于 `<dir>/<name><ext>`
		 * - `<dir>`: 引用的模块所在文件夹的相对路径
		 * - `<name>`: 引用的模块的文件名（不含文件夹和扩展名部分）
		 * - `<ext>`: 引用的模块的扩展名（含点）
		 * - `<md5>`: 引用的模块内容的 MD5 串（小写），默认截取前 8 位，如果要截取前 n 位，使用 `<md5:n>`
		 * - `<sha1>`: 引用的模块内容的 SHA-1 串（小写），默认截取前 8 位，如果要截取前 n 位，使用 `<sha1:n>`
		 * - `<date>`: 当前时间，默认为用户本地可读格式，如果要自定义格式，使用如 `<date:yyyyMMdd>`
		 * - `<random>`: 随机整数，默认为 8 位，如果要自定义为 n  位，使用如 `<random:n>`
		 * - `<version>`: 构建器的版本号
		 * @param moduleDependency 引用的模块
		 * @param module 要生成的模块
		 * @param builder 当前的构建器对象
		 */
		moduleAppend?: string | ((moduleDependency: Module, module: Module, builder: Builder) => string)
		/**
		 * 在每个依赖模块之间插入的代码
		 * @default "\n\n"
		 */
		moduleSeparator?: string
		/**
		 * 生成的文件中用于缩进源码的字符串
		 * @default "\t"
		 */
		indentString?: string
		/**
		 * 生成的文件中用于换行的字符串
		 * @default "\n"
		 */
		newLine?: string
	}
}

/** 表示一个文本模块 */
export interface TextModule extends Module {
	/** 获取当前模块关联的文档 */
	document: TextDocument
}

/** 表示一个由地址指定的依赖项 */
export interface ModuleURLDependency extends ModuleDependency {
	/** 依赖地址的协议部分 */
	protocol?: string
	/** 依赖地址是否包含双斜杠 */
	slashes?: boolean
	/** 依赖的用户名和密码部分 */
	auth?: string
	/** 依赖地址的主机和端口部分 */
	host?: string
	/** 依赖地址的路径部分 */
	pathname?: string
	/** 依赖地址的查询参数部分 */
	search?: string
	/** 依赖地址的查询参数对象 */
	query?: { [name: string]: string | string[] }
	/** 依赖地址的哈希值部分 */
	hash?: string
}