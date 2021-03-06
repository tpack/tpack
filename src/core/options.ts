import { BundlerOptions } from "../bundlers/common"
import { CSSBundlerOptions } from "../bundlers/css"
import { HTMLBundlerOptions } from "../bundlers/html"
import { JSBundlerOptions } from "../bundlers/js"
import { FileSystem } from "../utils/fileSystem"
import { Logger, LoggerOptions, LogLevel } from "../utils/logger"
import { Matcher, Pattern } from "../utils/matcher"
import { BuildContext, Builder } from "./builder"
import { Bundler } from "./bundler"
import { CacheOptions } from "./cache"
import { i18n } from "./i18n"
import { Module } from "./module"
import { PackageManager } from "./package"
import { ProcessorRule } from "./processor"
import { ServerOptions } from "./server"
import { WatcherOptions } from "./watcher"

/** 表示构建器的选项 */
export interface BuilderOptions {
	/** 允许扩展自定义属性 */
	[key: string]: any
	/**
	 * 需要构建的源文件夹
	 * @description 源文件夹内的所有文件都会被作为入口模块构建并生成到目标文件夹
	 * @default "src"
	 */
	rootDir?: string
	/**
	 * 生成的目标文件夹
	 * @description > 应尽量指定一个不存在的文件夹，否则原有的文件会被覆盖
	 * @default "dist"
	 */
	outDir?: string
	/**
	 * 指定源文件夹中哪些文件才需要构建，可以是通配符或正则表达式等，默认为所有非点开头的文件
	 * @default "**‌/*"
	 */
	match?: Pattern
	/**
	 * 指定源文件夹中哪些文件不需要构建，可以是通配符或正则表达式等
	 * @description > 注意即使文件被排除了，如果它被其它模块依赖，仍会参与构建
	 * @default ["**‌/node_modules/**‌"]
	 */
	exclude?: Pattern
	/** 指定应该如何编译不同类型的模块 */
	compilers?: ProcessorRule[]
	/** 指定应该如何打包模块依赖 */
	bundler?: {
		/** 指定打包的目标平台 */
		target?: "browser" | "node" | "electron"
		/** 指定如何提取外部的模块（如 `node_modules`），如果不匹配任一规则，则外部模块将内联（如 base64）到引用的模块中 */
		externalModules?: ExternalModuleRule[]
		/** 指定应该如何打包不同扩展名的模块，键为扩展名（含点），值为打包器构造函数或实例，如果设为 `false` 则不打包此类型 */
		bundlers?: { [ext: string]: (new (options: BuilderOptions["bundler"], builder: Builder) => Bundler) | false }
		/** 打包 HTML 模块的附加选项 */
		html?: HTMLBundlerOptions
		/** 打包 CSS 模块的附加选项 */
		css?: CSSBundlerOptions
		/** 打包 JavaScript 模块的附加选项 */
		js?: JSBundlerOptions
	} & BundlerOptions
	/**
	 * 是否启用优化
	 * @default process.env.NODE_ENV === "production"
	 */
	optimize?: boolean
	/** 指定应该如何优化不同类型的模块 */
	optimizers?: ProcessorRule[]
	/**
	 * 配置构建持久缓存，`false` 表示禁用缓存
	 * @default true
	 */
	cache?: boolean | CacheOptions
	/**
	 * 是否在全量构建前清理目标文件夹
	 * @description 注意如果生成文件夹等同于或包含了源文件夹，则清理选项会被自动禁用
	 * @default true
	 */
	clean?: boolean
	/**
	 * 生成源映射（Source Map）的选项，`false` 表示不生成，`true` 表示按默认配置生成
	 * @default !this.optimize
	 */
	sourceMap?: boolean | {
		/**
		 * 指定源映射的生成路径，如果是字符串，则其中以下标记会被替换：
	 	 * - `<path>`: 模块的相对路径，等价于 `<dir>/<name><ext>`
	 	 * - `<dir>`: 模块所在文件夹的相对路径
	 	 * - `<name>`: 模块的文件名（不含文件夹和扩展名部分）
	 	 * - `<ext>`: 模块的扩展名（含点）
	 	 * - `<hash>`: 模块的构建哈希值（小写），默认截取前 8 位，如果要截取前 n 位，使用 `<hash:n>`
	 	 * - `<md5>`: 模块内容的 MD5 串（小写），默认截取前 8 位，如果要截取前 n 位，使用 `<md5:n>`
	 	 * - `<sha1>`: 模块内容的 SHA-1 串（小写），默认截取前 8 位，如果要截取前 n 位，使用 `<sha1:n>`
	 	 * - `<random>`: 随机整数，默认为 8 位，如果要自定义为 n 位，使用如 `<random:n>`
	 	 * - `<date>`: 当前时间，默认为用户本地可读格式，如果要自定义格式，使用如 `<date:yyyyMMdd>`
	 	 * - `<version>`: 构建器的版本号
		 * @param module 所属的模块
		 * @param builder 当前的构建器对象
		 * @default "<path>.map"
		 */
		outPath?: string | ((module: Module, builder: Builder) => string)
		/**
		 * 源映射中引用源文件的根地址
		 * @example "file:///"
		 */
		sourceRoot?: string
		/**
		 * 获取源映射中引用每个源文件地址的回调函数
		 * @param sourcePath 源文件的绝对路径
		 * @param sourceMapPath 源映射的绝对路径
		 * @param module 所属的模块
		 * @param builder 当前的构建器对象
		 */
		source?: (sourcePath: string, sourceMapPath: string, module: Module, builder: Builder) => string
		/**
		 * 获取每个源文件内容的回调函数
		 * @param sourcePath 源文件绝对路径
		 * @param sourceMapPath 源映射绝对路径
		 * @param module 所属的模块
		 * @param builder 当前的构建器对象
		 */
		sourceContent?: (sourcePath: string, sourceMapPath: string, module: Module, builder: Builder) => string | Promise<string>
		/**
		 * 是否在源映射中内联源内容
		 * @default false
		 */
		includeSourcesContent?: boolean
		/**
		 * 是否在源映射中包含生成文件名字段
		 * @default true
		 */
		includeFile?: boolean
		/**
		 * 是否在源映射中包含符号名称字段
		 * @default true
		 */
		includeNames?: boolean
		/**
		 * 格式化源映射 JSON 时的缩进字符串或缩进空格数，如果为空或 0 则压缩成一行
		 * @default 0
		 */
		indent?: string | number
		/**
		 * 在生成的文件中插入的指向源映射的地址注释
		 * - `true`（默认）: 使用基于 `outPath` 计算的地址
		 * - `false` 不插入注释
		 * @param sourceMapPath 源映射的最终绝对路径
		 * @param module 所属的模块
		 * @param builder 当前构建器的对象
		 * @default true
		 */
		url?: boolean | ((sourceMapPath: string, module: Module, builder: Builder) => string | false)
		/**
		 * 是否将源映射使用 Base64 编码内联到生成的模块中
		 * @default false
		 */
		inline?: boolean
	}
	/**
	 * 是否在出现第一个错误后终止构建
	 * @default false
	 */
	bail?: boolean
	/** 日志记录器的选项 */
	logger?: Logger | LoggerOptions
	/**
	 * 构建完成后的报告内容
	 * - `"summary"`（默认）: 报告构建结果的概述
	 * - `true`/`"detail"`: 报告完整的构建结果
	 * - `false`/`null`: 不报告
	 * - 函数: 自定义报告内容
	 * @param context 构建的上下文
	 * @param builder 当前的构建器对象
	 * @default "summary"
	 */
	reporter?: "summary" | "detail" | boolean | ((context: BuildContext, builder: Builder) => string | void)
	/** 是否监听模块改动并主动重新构建 */
	watch?: boolean | WatcherOptions
	/**
	 * 是否启动本地开发服务器
	 * - `true`: 使用默认端口（根据项目名自动决定）启动开发服务器
	 * - `false`/`null`: 不启动开发服务器
	 * - 数字: 使用指定端口启动开发服务器
	 * - 字符串: 使用指定地址启动开发服务器
	 * - 对象: 根据对象的配置启动开发服务器
	 */
	devServer?: boolean | number | string | ServerOptions
	/**
	 * 用于安装依赖的命令，其中 `<package>` 会被替换为安装的包名
	 * @param name 要解析的包名
	 * @param baseDir 当前的工作目录
	 * @param target 当前的包管理器
	 * @default false
	 */
	installDependency?: boolean | string | ((name: string, baseDir: string, target: PackageManager) => boolean | Promise<boolean>)
	/**
	 * 用于安装开发依赖的命令，其中 `<package>` 会被替换为安装的包名
	 * @param name 要解析的包名
	 * @param baseDir 当前的工作目录
	 * @param target 当前的包管理器
	 * @default "npm install <package> --colors --save-dev"
	 * @example "yarn add <package> --dev"
	 */
	installDevDependency?: boolean | string | ((name: string, baseDir: string, target: PackageManager) => boolean | Promise<boolean>)
	/** 配置插件 */
	plugins?: Plugin[]
	/**
	 * 工作目录，配置文件中的所有路径都相对于此工作目录，默认为配置文件所在文件夹
	 * @default process.cwd()
	 */
	baseDir?: string
	/** 筛选本次需要构建的模块，可以是通配符或正则表达式等 */
	filter?: Pattern
	/**
	 * 读取文本模块内容时，默认使用的模块编码
	 * @description 默认仅支持 `utf-8`，如果需要支持其它编码，需安装相应插件
	 * @default "utf-8"
	 */
	encoding?: string
	/**
	 * 是否禁止路径检查，如果设为 `true`，则允许文件生成到目标文件夹外或覆盖源文件
	 * @default false
	 */
	noPathCheck?: boolean
	/**
	 * 是否仅构建但不实际生成模块，可用于验证代码是否有错但不影响任何模块
	 * @default false
	 */
	noWrite?: boolean
	/**
	 * 并行构建的线程数
	 * @default Math.ceil(require("os").cpus().length / 2)
	 */
	parallel?: number
	/** 所有自定义扩展名（含点）到 MIME 类型的映射表 */
	mimeTypes?: { [ext: string]: string }
	/** 使用的文件系统，可以自定义文件系统实现虚拟构建 */
	fs?: FileSystem
}

/** 表示提取外部模块的规则 */
export interface ExternalModuleRule {
	/**
	 * 指定哪些外部模块可以按此规则复制到项目中，可以是通配符或正则表达式等
	 * @default "*"
	 */
	match?: Pattern
	/** 指定额外排除的模块，可以是通配符或正则表达式等 */
	exclude?: Pattern
	/**
	 * 根据 MIME 类型指定哪些外部模块可以按此规则复制到项目中
	 * @example "image/*"
	 */
	matchType?: string
	/** 只有当模块的字节大小超过此值才会提取  */
	minSize?: number
	/**
	 * 复制到项目中的路径，如果是字符串，则其中以下标记会被替换：
	 * - `<path>`: 模块的相对路径，等价于 `<dir>/<name><ext>`
	 * - `<dir>`: 模块所在文件夹的相对路径
	 * - `<name>`: 模块的文件名（不含文件夹和扩展名部分）
	 * - `<ext>`: 模块的扩展名（含点）
	 * - `<hash>`: 模块的构建哈希值（小写），默认截取前 8 位，如果要截取前 n 位，使用 `<hash:n>`
	 * - `<md5>`: 模块内容的 MD5 串（小写），默认截取前 8 位，如果要截取前 n 位，使用 `<md5:n>`
	 * - `<sha1>`: 模块内容的 SHA-1 串（小写），默认截取前 8 位，如果要截取前 n 位，使用 `<sha1:n>`
	 * - `<random>`: 随机整数，默认为 8 位，如果要自定义为 n 位，使用如 `<random:n>`
	 * - `<date>`: 当前时间，默认为用户本地可读格式，如果要自定义格式，使用如 `<date:yyyyMMdd>`
	 * - `<version>`: 构建器的版本号
	 * @param module 要复制的外部模块对象
	 * @param builder 当前的构建器对象
	 * @returns 返回相对于根文件夹的相对路径
	 */
	outPath: string | ((module: Module, builder: Builder) => string)
}

/** 表示一个插件 */
export interface Plugin {
	/**
	 * 应用指定的插件
	 * @param builder 当前的构建器对象
	 */
	apply(builder: Builder): void
}

/**
 * 检查指定的配置是否是编译器配置
 * @param value 要检查的配置值
 * @param name 配置名
 * @param errors 用于返回所有错误的数组
 */
export function checkBuilderOptions(value: any, name: string, errors: string[]) {
	checkObject(value, name, {
		rootDir: checkPath,
		outDir: checkPath,
		match: checkPattern,
		exclude: checkPattern,

		compilers: checkProcessorRules,
		bundler(value, name, errors) {
			checkObject(value, name, {
				target(value, name, errors) {
					if (value === "browser" || value === "node") {
						return
					}
					errors.push(i18n`'${name}' should be ${"web"} or ${"node"}, got ${stringify(value)}`)
				},
				externalModules(value, name, errors) {
					checkArray(value, name, (value, name) => {
						checkObject(value, name, {
							match: checkPattern,
							exclude: checkPattern,
							matchType: checkString,
							minSize: checkNumber,
							outPath: checkStringOrFunction
						}, errors)
					}, errors)
				},
				bundlers(value, name, errors) {
					checkObject(value, name, (value, name, errors) => {
						if (value === false || value == null || typeof value === "function") {
							return
						}
						if (typeof value === "object") {
							checkFunction((value as Bundler).parse, `${name}.parse`, errors)
							checkFunction((value as Bundler).resolve, `${name}.resolve`, errors)
							checkFunction((value as Bundler).generate, `${name}.generate`, errors)
							return
						}
						errors.push(i18n`'${name}' should be of type ${"function"} or ${"object"}, got ${stringify(value)}`)
					}, errors)
				}

				// todo
			}, errors)
		},
		optimize: checkBoolean,
		optimizers: checkProcessorRules,

		cache(value, name, errors) {
			checkBooleanOrObject(value, name, {
				// todo
			}, errors)
		},
		clean: checkBoolean,
		sourceMap(value, name, errors) {
			checkBooleanOrObject(value, name, {
				outPath: checkStringOrFunction,
				sourceRoot: checkString,
				source: checkFunction,
				sourceContent: checkFunction,
				includeSourcesContent: checkBoolean,
				includeFile: checkBoolean,
				includeNames: checkBoolean,
				indent(name, value, errors) {
					if (typeof value === "string" || typeof value === "number") {
						return
					}
					errors.push(i18n`'${name}' should be of type ${"string"} or ${"number"}, got ${stringify(value)}`)
				},
				url(name, value, errors) {
					if (typeof value === "function" || typeof value === "boolean") {
						return
					}
					errors.push(i18n`'${name}' should be of type ${"boolean"} or ${"function"}, got ${stringify(value)}`)
				},
				inline: checkBoolean
			}, errors)
		},
		bail: checkBoolean,
		logger(value, name, errors) {
			if (value instanceof Logger) {
				return
			}
			if (typeof value === "object") {
				checkObject(value, name, {
					logLevel(value, name, errors) {
						// @ts-ignore
						checkEnum(value, name, LogLevel, errors)
					},
					ignore(value, name) {
						if (value instanceof RegExp || typeof value === "function") {
							return
						}
						errors.push(i18n`'${name}' should be of type ${"regexp"} or ${"function"}, got ${stringify(value)}`)
					},
					colors: checkBoolean,
					emoji: checkBoolean,
					timestamp: checkBoolean,
					fullPath: checkBoolean,
					baseDir: checkPath,
					codeFrame: checkBoolean,
					persistent: checkBoolean,
					spinner: checkBoolean,
					progress: checkBoolean,
					spinnerFrames: checkStringArray,
					spinnerInterval: checkNumber,
					hideCursor: checkBoolean,
					errorOrWarningCounter(value, name) {
						if (typeof value === "number" || value === false) {
							return
						}
						errors.push(i18n`'${name}' should be ${"false"} or of type ${"number"}, got ${stringify(value)}`)
					},
					successIcon: checkString,
					warningIcon: checkString,
					errorIcon: checkString,
					fatalIcon: checkString,
				}, errors)
				return
			}
			errors.push(i18n`'${name}' should be of type ${"Logger"} or ${"object"}, got ${stringify(value)}`)
		},
		reporter(value, name, errors) {
			if (value === "summary" || value === "detail" || typeof value === "boolean" || typeof value === "function") {
				return
			}
			errors.push(i18n`'${name}' should be ${'"summary"'}, ${'"detail"'} or of type ${"boolean"} or ${"function"}, got ${stringify(value)}`)
		},
		watch(value, name, errors) {
			// todo
			checkBooleanOrObject(value, name, {
				usePolling: checkBoolean,
				interval: checkNumber,
				delay: checkNumber,
			}, errors)
		},
		devServer(value, name, errors) {
			// todo
		},
		autoInstallPlugin: checkBoolean,
		autoInstallModule: checkBoolean,
		installCommand: checkFalseOrString,
		plugins(value, name, errors) {
			checkObject(value, name, (value, name, errors) => {
				if (value && typeof value === "object") {
					checkFunction((value as Plugin).apply, `${name}.apply`, errors)
					return
				}
				errors.push(i18n`'${name}' should be of type ${"object"}, got ${stringify(value)}`)
			}, errors)
		},

		baseDir: checkPath,
		filter: checkPattern,
		encoding: checkString,
		noPathCheck: checkBoolean,
		noWrite: checkBoolean,
		parallel: checkNumber,
		mimeTypes(value, name, errors) {
			checkObject(value, name, checkString, errors)
		},
		fs(value, name, errors) {
			if (value instanceof FileSystem) {
				return
			}
			errors.push(i18n`'${name}' should be of type ${"FileSystsem"}, got ${stringify(value)}`)
		}
	}, errors)
}

/**
 * 检查指定的配置是否是对象
 * @param value 要检查的配置值
 * @param name 配置名
 * @param entries 检查每项的规则或函数
 * @param errors 用于返回所有错误的数组
 */
export function checkObject(value: any, name: string, entries: { [key: string]: (value: any, name: string, errors: string[]) => void } | ((value: any, name: string, errors: string[]) => void), errors: string[]) {
	if (typeof value === "object") {
		for (const key in value) {
			const item = value[key]
			const itemKey = `${name}.${key}`
			if (typeof entries === "function") {
				entries(item, itemKey, errors)
			} else if (item != undefined) {
				const validator = entries[key]
				if (validator) {
					validator(item, itemKey, errors)
				}
			}
		}
		return
	}
	errors.push(i18n`'${name}' should be of type ${"object"}, got ${stringify(value)}`)
}

/**
 * 检查指定的配置是否是数组
 * @param value 要检查的配置值
 * @param name 配置名
 * @param entries 检查每项的函数
 * @param errors 用于返回所有错误的数组
 */
export function checkArray(value: any, name: string, entries: (value: any, name: string, errors: string[]) => void, errors: string[]) {
	if (Array.isArray(value)) {
		for (let i = 0; i < value.length; i++) {
			entries(value[i], `${name}[${i}]`, errors)
		}
		return
	}
	errors.push(i18n`'${name}' should be of type ${"array"}, got ${stringify(value)}`)
}

/**
 * 检查指定的配置是否是数字
 * @param value 要检查的配置值
 * @param name 配置名
 * @param errors 用于返回所有错误的数组
 */
export function checkNumber(value: any, name: string, errors: string[]) {
	if (typeof value === "number") {
		return
	}
	errors.push(i18n`'${name}' should be of type ${"number"}, got ${stringify(value)}`)
}

/**
 * 检查指定的配置是否是布尔值
 * @param value 要检查的配置值
 * @param name 配置名
 * @param errors 用于返回所有错误的数组
 */
export function checkBoolean(value: any, name: string, errors: string[]) {
	if (typeof value === "boolean") {
		return
	}
	errors.push(i18n`'${name}' should be of type ${"boolean"}, got ${stringify(value)}`)
}

/**
 * 检查指定的配置是否是字符串
 * @param value 要检查的配置值
 * @param name 配置名
 * @param errors 用于返回所有错误的数组
 */
export function checkString(value: any, name: string, errors: string[]) {
	if (typeof value === "string") {
		return
	}
	errors.push(i18n`'${name}' should be of type ${"string"}, got ${stringify(value)}`)
}

/**
 * 检查指定的配置是否是函数
 * @param value 要检查的配置值
 * @param name 配置名
 * @param errors 用于返回所有错误的数组
 */
export function checkFunction(value: any, name: string, errors: string[]) {
	if (typeof value === "function") {
		return
	}
	errors.push(i18n`'${name}' should be of type ${"function"}, got ${stringify(value)}`)
}

/**
 * 检查指定的配置是否是字符串或函数
 * @param value 要检查的配置值
 * @param name 配置名
 * @param errors 用于返回所有错误的数组
 */
export function checkStringOrFunction(value: any, name: string, errors: string[]) {
	if (typeof value === "string" || typeof value === "function") {
		return
	}
	errors.push(i18n`'${name}' should be of type ${"string"} or ${"function"}, got ${stringify(value)}`)
}

/**
 * 检查指定的配置是否是布尔或对象
 * @param value 要检查的配置值
 * @param name 配置名
 * @param errors 用于返回所有错误的数组
 */
export function checkBooleanOrObject(value: any, name: string, validateItem: { [key: string]: (value: any, name: string, errors: string[]) => void } | ((value: any, name: string) => void), errors: string[]) {
	if (typeof value === "boolean") {
		return
	}
	if (typeof value === "object") {
		checkObject(value, name, validateItem, errors)
		return
	}
	errors.push(i18n`'${name}' should be of type ${"boolean"} or ${"object"}, got ${stringify(value)}`)
}

/**
 * 检查指定的配置是否是 `false` 或字符串
 * @param value 要检查的配置值
 * @param name 配置名
 * @param errors 用于返回所有错误的数组
 */
export function checkFalseOrString(value: any, name: string, errors: string[]) {
	if (value === false || typeof value === "string") {
		return
	}
	errors.push(i18n`'${name}' should be ${"false"} or of type ${"string"}, got ${stringify(value)}`)
}

/**
 * 检查指定的配置是否是字符串数组
 * @param value 要检查的配置值
 * @param name 配置名
 * @param errors 用于返回所有错误的数组
 */
export function checkStringArray(value: any, name: string, errors: string[]) {
	checkArray(value, name, checkString, errors)
}

/**
 * 检查指定的配置是否是枚举
 * @param value 要检查的配置值
 * @param name 配置名
 * @param entries 枚举对象
 * @param errors 用于返回所有错误的数组
 */
export function checkEnum(value: any, name: string, entries: { [key: string]: string | number }, errors: string[]) {
	if (value in entries) {
		return
	}
	errors.push(i18n`'${name}' should be one of: ${Object.keys(entries).filter(key => typeof entries[key] === "number").map(key => JSON.stringify(key))}, got ${stringify(value)}`)
}

/**
 * 检查指定的配置是否是路径
 * @param value 要检查的配置值
 * @param name 配置名
 * @param errors 用于返回所有错误的数组
 */
export function checkPath(value: any, name: string, errors: string[]) {
	if (typeof value === "string") {
		if (/^\s|\s$|[<>|&]/.test(value)) {
			errors.push(i18n`'${name}' is not a valid path, got ${stringify(value)}`)
		}
		return
	}
	checkString(value, name, errors)
}

/**
 * 检查指定的配置是否是模式
 * @param value 要检查的配置值
 * @param name 配置名
 * @param errors 用于返回所有错误的数组
 */
export function checkPattern(value: any, name: string, errors: string[]) {
	if (typeof value === "string" || value instanceof RegExp || typeof value === "function" || value instanceof Matcher) {
		return
	}
	if (Array.isArray(value)) {
		checkArray(value, name, checkPattern, errors)
		return
	}
	errors.push(i18n`'${name}' should be of type ${"string"}, ${"regexp"}, ${"function"} or ${"array"}, got ${stringify(value)}`)
}

/**
 * 检查指定的配置是否是处理器规则
 * @param value 要检查的配置值
 * @param name 配置名
 * @param errors 用于返回所有错误的数组
 */
export function checkProcessorRules(value: any, name: string, errors: string[]) {
	checkArray(value, name, (value, name, errors) => {
		checkObject(value, name, {
			name: checkString,
			read(value, name, errors) {
				if (typeof value === "boolean" || value === "binary" || value === "text") {
					return
				}
				errors.push(i18n`'${name}' should be ${"true"}, ${"false"}, ${'"binary"'} or ${'"text"'}, got ${stringify(value)}`)
			},
			process: checkFunction,
			match: checkPattern,
			exclude: checkPattern,
			test: checkFunction,
			use(value, name2, errors) {
				if (typeof value === "string" || typeof value === "function") {
					return
				}
				if (typeof value === "object") {
					if (Array.isArray(value)) {
						checkProcessorRules(value, name2, errors)
					}
					if (value.process != null) {
						errors.push(i18n`'${name2}' and '${name + ".process"}' cannot be specified together`)
					}
					return
				}
				errors.push(i18n`'${name2}' should be of type ${"string"}, ${"function"} or ${"array"}, got ${stringify(value)}`)
			},
			outPath: checkStringOrFunction,
			break: checkBoolean
		}, errors)
	}, errors)
}

/** 获取变量的字符串形式 */
function stringify(value: any) {
	switch (typeof value) {
		case "object":
			if (value === null) {
				return "null"
			}
			if (value instanceof RegExp) {
				return value.toString()
			}
			if (value instanceof Date) {
				return `Date('${value.toLocaleString()}')`
			}
			return typeof value.constructor === "function" && value.constructor.name || "Object"
		case "function":
			return "Function"
		case "symbol":
		case "bigint":
			return value.toString()
		case "undefined":
			return "undefined"
		default:
			return JSON.stringify(value)
	}
}