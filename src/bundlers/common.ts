import { stringify } from "querystring"
import { parse, UrlWithParsedQuery, format } from "url"
import { Builder } from "../core/builder"
import { i18n } from "../core/i18n"
import { Bundler as IBundler } from "../core/options"
import { Resolver } from "../core/resolver"
import { VFile, VFileLogEntry, VFileState } from "../core/vfile"
import { encodeDataURI } from "../utils/base64"
import { Matcher } from "../utils/matcher"
import { getDir, isAbsolutePath, relativePath, resolvePath } from "../utils/path"
import { TextDocument } from "../utils/textDocument"

/** 表示一个模块依赖打包器基类 */
export abstract class Bundler implements IBundler {

	// #region 选项

	/**
	 * 初始化新的打包器
	 * @param options 构建器的选项
	 * @param builder 所属的构建器
	 */
	constructor(options: BundlerOptions, builder: Builder) {
		const outputOptions = options.output || {}
		this.formatURLPath = outputOptions.formatURLPath || (outputOptions.publicURL != undefined ? (file, containingFile, builder) => outputOptions.publicURL + builder.relativePath(file.path) : (file, containingFile) => relativePath(getDir(containingFile.path), file.path))
		this.appendURLQuery = typeof outputOptions.appendURLQuery !== "string" ? outputOptions.appendURLQuery : (file, containingFile, builder) => builder.formatPath(outputOptions.appendURLQuery as string, file)
		this.formatURL = outputOptions.formatURL || (dependency => format(dependency))
		// this.prepend = typeof options.prepend === "string" ? (module, builder) => builder.formatPath(options.prepend as string, module) : options.prepend
		// this.append = typeof options.append === "string" ? (module, builder) => builder.formatPath(options.append as string, module) : options.append
		// this.modulePrepend = typeof options.modulePrepend === "string" ? (module, _, builder) => builder.formatPath(options.modulePrepend as string, module) : options.modulePrepend
		// this.moduleAppend = typeof options.moduleAppend === "string" ? (module, _, builder) => builder.formatPath(options.moduleAppend as string, module) : options.moduleAppend
		// this.moduleSeparator = options.moduleSeparator != undefined ? options.moduleSeparator : "\n\n"
		// this.indentString = options.indentString != undefined ? options.indentString : "  "
		// this.newLine = options.newLine != undefined ? options.newLine : "\n"

		this.resolvers = {}
		this.noCheckQuery = options.noCheckQuery !== undefined ? options.noCheckQuery : "nocheck"
		this.inlineQuery = options.inlineQuery !== undefined ? options.inlineQuery : "inline"
	}

	// #endregion

	// #region 流程

	/**
	 * 解析指定的文件
	 * @param file 要解析的文件
	 * @param builder 当前的构建器对象
	 */
	async parse(file: VFile, builder: Builder) {
		// 解析模块
		const module = await this.parseModule(file, builder)
		file.setProp(Module, module)
		// 分析模块依赖
		const promises: Promise<void>[] = []
		for (const dependency of module.dependecies) {
			promises.push(this.resolveDependency(dependency, file, builder))
		}
		await Promise.all(promises)
	}

	/**
	 * 当被子类重写时负责解析指定文件对应的模块
	 * @param file 要解析的文件
	 * @param builder 当前的构建器对象
	 */
	protected abstract parseModule(file: VFile, builder: Builder): Module | Promise<Module>

	/** 所有可用的模块依赖解析器 */
	readonly resolvers: {
		/** 源文件路径的匹配器 */
		readonly matcher?: Matcher
		/**
		 * 在解析依赖之前的回调函数
		 * @param dependency 要解析的依赖项
		 * @param file 当前地址所在的文件
		 * @param builder 当前的构建器对象
		 */
		readonly before?: (dependency: ModuleDependency, file: VFile, builder: Builder) => void | Promise<void>
		/** 模块路径解析器，如果为 `undefined` 则只按相对路径解析 */
		readonly moduleResolver?: Resolver
		/** 所有内置模块 */
		readonly builtinModules?: { [name: string]: string | false }
		/** 是否强制区分路径大小写 */
		readonly enforceCaseSensitive?: boolean
		/**
		 * 在解析依赖之后的回调函数
		 * @param dependency 要解析的依赖项
		 * @param file 当前地址所在的文件
		 * @param builder 当前的构建器对象
		 */
		readonly after?: (dependency: ModuleDependency, file: VFile, builder: Builder) => void | Promise<void>
		/** 下一个解析器 */
		readonly next?: Bundler["resolvers"]
	}

	/** 获取用于标记不检查指定地址的查询参数名 */
	readonly noCheckQuery?: string | false

	/** 获取用于标记内联引用的查询参数名 */
	readonly inlineQuery?: string | false

	/** 
	 * 解析指定的依赖
	 * @param dependency 要解析的依赖项
	 * @param file 当前地址所在的文件
	 * @param builder 当前的构建器对象
	 */
	protected async resolveDependency(dependency: ModuleDependency, file: VFile, builder: Builder) {
		if (dependency.resolvedFile) {
			builder.loadFile(dependency.resolvedFile)
			return
		}
		// 支持 ?nocheck&inline
		if (dependency.search) {
			if (this.noCheckQuery) {
				const noCheck = dependency.query[this.noCheckQuery]
				if (noCheck !== undefined) {
					delete dependency.query[this.noCheckQuery]
					dependency.search = stringify(dependency.query)
				}
				if (noCheck === "" || noCheck === "true") {
					return
				}
			}
			if (this.inlineQuery) {
				const inline = dependency.query[this.inlineQuery]
				if (inline !== undefined) {
					delete dependency.query[this.inlineQuery]
					dependency.search = stringify(dependency.query)
				}
				if (inline === "" || inline === "true") {
					dependency.inline = true
				} else if (inline === "false") {
					dependency.inline = false
				}
			}
		}
		// 搜索匹配的地址解析器
		let resolver = this.resolvers
		while (resolver.matcher && !resolver.matcher.test(file.path)) {
			resolver = resolver.next!
			if (!resolver) {
				return
			}
		}
		// 完整解析流程
		if (resolver.before) {
			await resolver.before(dependency, file, builder)
		}
		let resolvedPath: string | null | false | undefined
		let detail: string | undefined
		const name = dependency.pathname || ""
		// 忽略绝对地址(http://..., javascript:..., /path/to/file...)
		if (!dependency.hostname && !dependency.protocol && name && name.charCodeAt(0) !== 47 /*/*/) {
			if (resolver.moduleResolver) {
				// 解析模块(node_modules)
				if (resolver.builtinModules && (resolvedPath = resolver.builtinModules[name]) !== undefined) {
					// 首次使用自动下载依赖
					if (resolvedPath && !isAbsolutePath(resolvedPath)) {
						resolver.builtinModules[name] = resolvedPath = await builder.requireResolve(resolvedPath)
					}
				} else {
					const containingDir = getDir(file.originalPath)
					if ((resolvedPath = await resolver.moduleResolver.resolve(name, containingDir)) === null) {
						// 自动安装文件
						if (builder.autoInstall) {
							await builder.installPackage(name)
						}
						// 重新解析一次，收集错误原因
						const trace: string[] = []
						resolvedPath = await resolver.moduleResolver.resolve(name, containingDir, trace)
						detail = trace.join("\n")
					}
				}
			} else {
				// 解析相对路径
				resolvedPath = resolvePath(file.originalPath, "..", name)
				const realPath = await builder.fs.getRealPath(resolvedPath)
				if (realPath) {
					// 检查大小写
					if (resolver.enforceCaseSensitive) {
						const baseDir = getDir(file.originalPath)
						const realUrl = relativePath(baseDir, realPath)
						const actualUrl = relativePath(baseDir, resolvedPath)
						if (realUrl !== actualUrl) {
							file.addWarning({
								source: this.constructor.name,
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
		dependency.resolvedPath = resolvedPath
		if (resolver.after) {
			await resolver.after(dependency, file, builder)
			resolvedPath = dependency.resolvedPath
		}
		if (resolvedPath) {
			builder.loadFile(dependency.resolvedFile = builder.getFile(resolvedPath))
		} else if (resolvedPath === null) {
			const logEntry: VFileLogEntry = {
				source: this.constructor.name,
				message: resolver.moduleResolver ? i18n`Cannot find module '${name}'` : i18n`Cannot find file '${builder.logger.formatPath(resolvePath(file.originalPath, "..", name))}'`,
				detail: detail,
				index: dependency.index,
				endIndex: dependency.endIndex,
			}
			if (dependency.dynamic) {
				file.addWarning(logEntry)
			} else {
				file.addError(logEntry)
			}
			await builder.emit("dependencyNotFound", dependency, file)
		}
	}

	/**
	 * 生成指定的文件
	 * @param file 要生成的文件
	 * @param builder 当前的构建器对象
	 */
	async generate(file: VFile, builder: Builder) {
		const module = file.getProp(Module) as Module
		if (!module) {
			return
		}
		let pathFixed = 0
		for (const dependency of module.dependecies) {
			// 跳过不能正确解析的依赖
			const resolvedFile = dependency.resolvedFile
			if (!resolvedFile) {
				continue
			}
			// todo: 警告路径不能被修改
			pathFixed = 1
			// 如果静态依赖外部模块，则无需生成目标模块
			if (!resolvedFile.isExternal || dependency.dynamic) {
				await builder.emitFile(resolvedFile)
				// 自动内联不生成最终文件的依赖
				if (resolvedFile.noWrite) {
					dependency.inline = true
				}
				// 生成 A 时会将 A 标记为“正在生成”，然后生成依赖 B
				// 生成 B 时会将 B 标记为“正在生成”，然后生成依赖 A
				// 此时如果发现 A 正在生成，说明存在循环依赖
				if (resolvedFile.state === VFileState.emitting) {
					pathFixed = 2
					if (dependency.dynamic) {
						if (dependency.inline) {
							dependency.inline = false
							file.addError({
								source: this.constructor.name,
								message: i18n`Cannot inline '${builder.logger.formatPath(resolvedFile.originalPath)}' because of circular reference`,
								index: dependency.index,
								endIndex: dependency.endIndex
							})
						}
					} else {
						dependency.resolvedFile = undefined
						file.addError({
							source: this.constructor.name,
							message: i18n`Circular dependency with '${builder.logger.formatPath(resolvedFile.originalPath)}'`,
							index: dependency.index,
							endIndex: dependency.endIndex
						})
					}
				}
			}
			if (dependency.inline && resolvedFile.data === undefined) {
				await builder.readFile(resolvedFile, false, this.constructor.name)
			}
			// 记录依赖
			file.addDependency({
				source: this.constructor.name,
				file: resolvedFile,
				type: dependency.type,
			//	watch: dependency.dynamic && !dependency.inline ? "reloadOnDelete" : "reemit"
			})
		}
		if (pathFixed) {
			let path = file.path
			Object.defineProperty(file, "path", {
				get() {
					return path
				},
				set(value) {
					if (pathFixed === 1 ? getDir(path) !== getDir(value) : path !== value) {
						file.addWarning(i18n`Changing the path of file during optimizing will cause the relative path in this file cannot be resolved correctly`)
					}
					path = value
				}
			})
		}
		if (file.sourceMap) {
			const result = module.generate(file, builder)
			file.content = result.content
			file.sourceMapBuilder = result.sourceMapBuilder
		} else {
			file.content = module.toString(file, builder)
		}
	}

	// #endregion

	// #region 辅助

	/**
	 * 解析模块中的一个地址
	 * @param url 要解析的地址
     * @param startIndex 地址在源文件的开始索引
     * @param endIndex 地址在源文件的结束索引（不含）
	 * @param type 地址的类型
	 * @param module 地址所在的模块
	 * @param formatter 格式化输出内容的函数
	 * @param formatter.content 要格式化的内容
	 * @param formatter.containingFile 最终生成的目标文件
	 * @param formatter.builder 当前的构建器对象
	 */
	protected parseURL(url: string, startIndex: number, endIndex: number, type: string, module: Module, formatter?: (content: string, containingFile: VFile, builder: Builder) => string) {
		const dependency = module.addDependency(url, startIndex, endIndex, type, true)
		module.replace(startIndex, endIndex, (containingFile: VFile, builder: Builder) => {
			const url = this.buildURL(dependency, containingFile, builder)
			return formatter ? formatter(url, containingFile, builder) : url
		})
	}

	/**
	 * 计算最终在生成模块中引用其它模块的地址的回调函数
	 * @param file 依赖的文件
	 * @param containingFile 生成的目标文件
	 * @param builder 当前的构建器对象
	 * @returns 返回生成的地址
	 */
	readonly formatURLPath: (file: VFile, containingFile: VFile, builder: Builder) => string

	/** 
	 * 计算在地址查询参数追加内容的回调函数
	 * @param file 依赖的文件
	 * @param containingFile 生成的目标文件
	 * @param builder 当前的构建器对象
	 * @returns 返回生成的查询参数
	 */
	readonly appendURLQuery?: (file: VFile, containingFile: VFile, builder: Builder) => string

	/**
	 * 计算最终在生成模块中引用其它模块的地址的回调函数
	 * @param dependency 依赖项
	 * @param containingFile 生成的目标文件
	 * @param builder 当前的构建器对象
	 * @returns 返回生成的地址
	 */
	readonly formatURL: (dependency: ModuleDependency, containingFile: VFile, builder: Builder) => string

	/**
	 * 获取指定依赖的最终引用地址
	 * @param dependency 依赖项
	 * @param containingFile 生成的目标文件
	 * @param builder 当前的构建器对象
	 */
	protected buildURL(dependency: ModuleDependency, containingFile: VFile, builder: Builder) {
		const resolvedFile = dependency.resolvedFile
		if (resolvedFile) {
			// 内联文件
			if (dependency.inline) {
				return encodeDataURI(resolvedFile.type!, resolvedFile.buffer)
			}
			// 格式化地址
			dependency = { ...dependency }
			dependency.pathname = this.formatURLPath(resolvedFile, containingFile, builder)
			if (this.appendURLQuery) {
				const newQuery = this.appendURLQuery(resolvedFile, containingFile, builder)
				dependency.search = dependency.search ? dependency.search + "&" + newQuery : newQuery
			}
		}
		return this.formatURL(dependency, containingFile, builder)
	}

	/**
	 * 解析要包含的文件
	 * @param url 要解析的包含地址
     * @param urlStartIndex 地址在源文件的开始索引
     * @param urlEndIndex 地址在源文件的结束索引（不含）
	 * @param type 包含的类型
	 * @param startIndex 源文件需要替换的开始索引
	 * @param endIndex 源文件需要替换的结束索引（不含）
	 * @param module 地址所在的模块
	 */
	protected parseInclude(url: string, urlStartIndex: number, urlEndIndex: number, type: string, startIndex: number, endIndex: number, module: Module) {
		const dependency = module.addDependency(url, urlStartIndex, urlEndIndex, type)
		module.replace(startIndex, endIndex, () => {
			const resolvedFile = dependency.resolvedFile
			if (!resolvedFile) {
				return module.content.substring(startIndex, endIndex)
			}
			const other = resolvedFile.getProp(Module) as Module
			if (other && other.constructor === module.constructor) {
				return other
			}
			return resolvedFile.content
		})
	}

	/**
	 * 解析内联的独立文件
	 * @param content 要解析的源码内容
	 * @param type 源码的扩展名类型
	 * @param startIndex 子文件在源文件的开始索引
	 * @param endIndex 子文件在源文件的结束索引（不含）
	 * @param file 所在的文件
	 * @param module 子文件所在的模块
	 * @param formatter 格式化输出内容的函数
	 * @param formatter.content 要格式化的内容
	 * @param formatter.containingFile 最终生成的目标文件
	 * @param formatter.builder 当前的构建器对象
	 */
	protected parseSubfile(content: string, type: string, startIndex: number, endIndex: number, file: VFile, module: Module, formatter?: (content: string, containingFile: VFile, builder: Builder) => string) {
		const subfile = file.createSubfile(`${file.originalPath}|${startIndex}.${type}`, content, startIndex)
		subfile.noWrite = true
		const dependency = { dynamic: true, resolvedFile: subfile } as ModuleDependency
		module.dependecies.push(dependency)
		module.replace(startIndex, endIndex, formatter ? (containingFile: VFile, builder: Builder) => formatter(subfile.content, containingFile, builder) : () => subfile.content)
	}

	/**
	 * 在最终合并生成的模块开头追加的内容
	 * @param containingModule 要生成的模块
	 * @param builder 当前的构建器对象
	 * @example "/* This file is generated by tpack. DO NOT EDIT DIRECTLY!! *‌/"
	 */
	readonly prepend?: (containingModule: Module, builder: Builder) => string

	/**
	 * 在最终合并生成的模块末尾追加的内容
	 * @param containingModule 要生成的模块
	 * @param builder 当前的构建器对象
	 */
	readonly append?: (containingModule: Module, builder: Builder) => string

	/**
	 * 在每个依赖模块开头追加的内容
	 * @param module 引用的模块
	 * @param containingModule 要生成的模块
	 * @param builder 当前的构建器对象
	 */
	readonly modulePrepend?: (module: Module, containingModule: Module, builder: Builder) => string

	/**
	 * 在每个依赖模块末尾追加的内容
	 * @param module 引用的模块
	 * @param containingModule 要生成的模块
	 * @param builder 当前的构建器对象
	 */
	readonly moduleAppend?: (module: Module, containingModule: Module, builder: Builder) => string

	/** 在每个依赖模块之间插入的代码 */
	readonly moduleSeparator?: string

	/** 生成的文件中用于缩进源码的字符串 */
	readonly indentString?: string

	/** 生成的文件中用于换行的字符串 */
	readonly newLine?: string

	// #endregion

}

/** 表示打包器的选项 */
export interface BundlerOptions {
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
	/** 表示最终打包生成的选项 */
	output?: {
		/**
		 * 计算最终在生成模块中引用其它模块的地址的回调函数
	 	 * @param file 依赖的文件
	 	 * @param containingFile 生成的目标文件
	 	 * @param builder 当前的构建器对象
		 * @returns 返回生成的地址
		 */
		formatURLPath?: (file: VFile, containingFile: VFile, builder: Builder) => string
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
		 * - `<builder>`: 构建器的名字，默认为 `TPack`
		 * - `<version>`: 构建器的版本号
	  	 * @param file 依赖的文件
	  	 * @param containingFile 生成的目标文件
	  	 * @param builder 当前的构建器对象
	  	 * @returns 返回生成的查询参数
		 */
		appendURLQuery?: string | ((file: VFile, containingFile: VFile, builder: Builder) => string)
		/**
		 * 自定义最终生成的模块引用其它模块的地址的回调函数
		 * @param dependency 依赖项
		 * @param containingFile 生成的目标文件
		 * @param builder 当前的构建器对象
		 * @returns 返回生成的地址
		 */
		formatURL?: (dependency: ModuleDependency, containingFile: VFile, builder: Builder) => string
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
		 * - `<builder>`: 构建器的名字，默认为 `TPack`
		 * - `<version>`: 构建器的版本号
		 * @param containingModule 要生成的模块
		 * @param builder 当前的构建器对象
		 * @example "/* This file is generated by <builder>. DO NOT EDIT DIRECTLY!! *‌/"
		 */
		prepend?: string | ((containingModule: Module, builder: Builder) => string)
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
		 * - `<builder>`: 构建器的名字，默认为 `TPack`
		 * - `<version>`: 构建器的版本号
		 * @param containingModule 要生成的模块
		 * @param builder 当前的构建器对象
		 */
		append?: string | ((containingModule: Module, builder: Builder) => string)
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
		 * - `<builder>`: 构建器的名字，默认为 `TPack`
		 * - `<version>`: 构建器的版本号
		 * @param module 引用的模块
		 * @param containingModule 要生成的模块
		 * @param builder 当前的构建器对象
		 */
		modulePrepend?: string | ((module: Module, containingModule: Module, builder: Builder) => string)
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
		 * - `<builder>`: 构建器的名字，默认为 `TPack`
		 * - `<version>`: 构建器的版本号
		 * @param module 引用的模块
		 * @param containingModule 要生成的模块
		 * @param builder 当前的构建器对象
		 */
		moduleAppend?: string | ((module: Module, containingModule: Module, builder: Builder) => string)
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

/** 表示一个模块 */
export abstract class Module extends TextDocument {

	readonly id: string

	/**
	 * 初始化新的模块
	 * @param file 模块的原始文件对象
	 */
	constructor(file: VFile, builder: Builder) {
		super(file.content, file.originalPath, file.sourceMapBuilder)
		this.id = builder.relativePath(file.path)
	}

	/** 获取所有模块依赖项 */
	readonly dependecies: ModuleDependency[] = []

	/**
	 * 添加一个模块依赖项
	 * @param url 依赖的地址
	 * @param startIndex 地址在源文件的开始索引
	 * @param endIndex 地址在源文件的结束索引（不含）
	 * @param type 依赖的类型
	 * @param dynamic 是否是动态导入，如果动态导入解析失败则只警告而非报错
	 */
	addDependency(url: string, startIndex?: number, endIndex?: number, type?: string, dynamic?: boolean) {
		const dependency = parse(url, true, true) as ModuleDependency
		dependency.index = startIndex
		dependency.endIndex = endIndex
		dependency.type = type
		dependency.dynamic = dynamic
		this.dependecies.push(dependency)
		return dependency
	}

}

/** 表示一个模块依赖项 */
export interface ModuleDependency extends UrlWithParsedQuery {
	/** 原始的地址 */
	href?: string
	/** 路径名部分 */
	pathname?: string
	/** 查询参数部分 */
	search?: string
	/** 哈希值部分 */
	hash?: string
	/** 地址在源文件的索引（从 0 开始）*/
	index?: number
	/** 地址在源文件的结束索引（从 0 开始）*/
	endIndex?: number
	/** 依赖的类型 */
	type?: string
	/** 是否是动态导入，如果动态导入解析失败则只警告而非报错 */
	dynamic?: boolean
	/** 是否内联地址依赖的文件 */
	inline?: boolean
	/** 已解析的本地绝对地址 */
	resolvedPath?: string | null | false
	/** 已解析的文件对象 */
	resolvedFile?: VFile
}