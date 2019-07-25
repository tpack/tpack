import * as ESTree from "meriyah/src/estree"
import { Builder } from "../core/builder"
import { Bundler as IBundler } from "../core/bundler"
import { Module, ModuleDependency, ModuleState, ModuleDependencyType } from "../core/module"
import { Matcher, Pattern } from "../utils/matcher"
import { TextBundler, BundlerOptions, TextModule } from "./common"
import { write, readFileSync } from "fs";
import { TextWriter, SourceMapTextWriter } from "../utils/textWriter";
import { encodeJS, quoteJSString } from "../utils/js";
import { Resolver } from "../core/resolver";
import { TextDocument } from "../utils/textDocument";
import { encodeDataURI } from "../utils/base64";

/** 表示一个 JavaScript 模块打包器 */
export default class JSBundler extends TextBundler implements IBundler {

	// #region 选项

	/**
	 * 初始化新的打包器
	 * @param options 构建器的选项
	 * @param builder 所属的构建器
	 */
	constructor(options: JSBundlerOptions = {}, builder: Builder) {
		super(options, builder)
	}

	// #endregion

	// #region 流程

	/** 获取模块渲染器 */
	readonly renderer = new JSModuleRenderer()

	/**
	 * 解析指定的文本模块
	 * @param document 要解析的文档
	 * @param module 要解析的模块
	 * @param builder 当前的构建器对象
	 */
	protected async parseDocument(document: TextDocument, module: TextModule, builder: Builder) {
		const esParser = (await builder.require("meriyah")) as typeof import("meriyah")
		const ast = esParser.parse(document.content, {
			// tolerant: true,
			// skipShebang: true,
			jsx: true,
			next: true,
			globalReturn: true,
			module: true,
			ranges: true,
			// experimental: true
		})
		this.renderer.render(module, ast)
	}

	/**
	 * 合成指定的模块
	 * @param module 要合成的模块
	 * @param generatedModule 合成的目标模块
	 * @param builder 当前的构建器对象
	 */
	generate(module: TextModule, generatedModule: Module, builder: Builder) {
		debugger
		const bundle = new Bundle(builder.relativePath(module.path), module)
		addDep(module, bundle)

		function addDep(module: Module, bundle: Bundle) {
			if (module.dependencies) {
				for (const dependency of module.dependencies) {
					if (dependency.module && dependency.type === ModuleDependencyType.staticImport) {
						if (bundle.has(dependency.module)) {
							continue
						}
						addDep(dependency.module, bundle)
					}
				}
			}
			bundle.add(module)
		}
		if (module.sourceMap) {
			const writer = new SourceMapTextWriter()
			this.writeBundle(bundle, writer, generatedModule, builder)
			generatedModule.content = writer.content
			generatedModule.sourceMapBuilder = writer.sourceMapBuilder
		} else {
			const writer = new TextWriter()
			this.writeBundle(bundle, writer, generatedModule, builder)
			generatedModule.content = writer.content
		}
	}

	loader = `var tpack = tpack || {
	cache: { __proto__: null },
	define: function (moduleName, factory) {
		tpack.cache[moduleName.toLowerCase()] = {
			loaded: false,
			define: factory,
			exports: {}
		};
	},
	require: function (moduleName, callback, data) {
		if (typeof moduleName === "string") {
			var module = tpack.cache[moduleName.toLowerCase()];
			if (typeof callback === "function") {
				if (module) {
					setTimeout(callback, 0, tpack.require(moduleName), data);
				} else {
					tpack.async((tpack.baseUrl || "") + moduleName + (tpack.urlArgs || ""), function () {
						callback(tpack.require(moduleName), data);
					});
				}
			} else {
				if (!module) {
					throw "Cannot find module '" + moduleName + "'";
				}
				if (!module.loaded) {
					module.loaded = true;
					module.define(tpack.require, module.exports, module);
				}
				return module.exports;
			}
		} else {
			var pending = moduleName.length;
			if (pending) {
				var exports = [];
				for (var i = 0; i < pending; i++) {
					tpack.require(moduleName[i], function (moduleExport, i) {
						exports[i] = moduleExport;
						--pending < 1 && callback && callback.apply(this, exports);
					}, i);
				}
			} else {
				callback && callback(this);
			}
		}
	},
	async: function (url, callback) {
		var script = document.createElement("script");
		script.async = true;
		script.onload = callback;
		script.src = url;
		return (document.head || document.getElementsByTagName("head")[0] || document.documentElement).appendChild(script);
	},
	style: function (content) {
		return (document.head || document.getElementsByTagName("head")[0] || document.documentElement).appendChild(document.createElement('style')).innerHTML = content;
	}
};`

	protected writeBundle(bundle: Bundle, writer: TextWriter, generatedModule: Module, builder: Builder) {
		writer.write(this.loader)
		for (const dependencyModule of bundle) {
			writer.write(`\n\ntpack.define(${quoteJSString(builder.relativePath(dependencyModule.path))}, function (require, exports, module) {\n`)
			writer.indent()
			// todo:  用  JSModule  类型标识？
			switch (dependencyModule.type) {
				case "text/javascript":
					if ((dependencyModule as TextModule).document) {
						(dependencyModule as TextModule).document.write(writer)
					} else {
						writer.write(dependencyModule.content, 0, dependencyModule.content.length, dependencyModule.originalPath, 0, 0, undefined, dependencyModule.sourceMapData!)
					}
					break
				case "text/css":
					writer.write(`module.exports = tpack.style(${quoteJSString(dependencyModule.content)});`);
					break
				case "application/json":
					writer.write(`module.exports = ${dependencyModule.content};`);
					break
				default:
					if (dependencyModule.type!.startsWith("text/")) {
						writer.write(`module.exports = ${quoteJSString(dependencyModule.content)};`)
					} else {
						writer.write(`module.exports = ${quoteJSString(encodeDataURI(dependencyModule.type!, dependencyModule.bufferOrContent))};`)
					}
					break
			}
			writer.unindent();
			writer.write(`\n});`);
		}
		writer.write(`\n\ntpack.require(${quoteJSString(bundle.id)});`);
	}

	// #endregion

	// #region 公共模块提取

	/** 获取所有公共模块拆分规则 */
	readonly jsCommonModules: ResolvedJSCommonModuleRule[] = []

	///**
	// * 计算文件的打包结果
	// * @param files 所有入口文件
	// * @param builder 当前的构建器对象
	// */
	//bundle(files: VFile[], builder: Builder) {
	//	// 如果每个入口模块在运行时加载其依赖模块和依赖的依赖，会导致页面请求数过多
	//	// 反之如果把每个入口模块和其依赖各自合并成独立的包，会导致很多模块被重复下载
	//	// 因此我们需要一个算法来提取部分公共模块，以维持页面请求数和模块重复下载率之间的平衡

	//	// 所有入口模块和动态导入的模块都会生成一个包（Bundle），提取的公共模块也将组成一个新包
	//	// 一个包可能有多个父包，如果父包包含了一个模块，则子包不需要重复包含
	//	// 提取算法的目的就是计算所有的包以及包包含的模块

	//	// 提取算法的核心思想是：在未超出请求数限制时，按以下优先级提取公共模块：
	//	// 1. 最不常更新的模块（通过路径配置），以确保缓存的最大利用率
	//	// 2. 被不同包依赖次数最多的模块，以确保缓存的最大命中率
	//	// 3. 提取的公共模块体积最大，以确保所有包的总体积最小
	//	// 4. 提取的公共模块数最多，以确保所有包加上加载器的总体积最小
	//	// 5. 提取的公共模块路径排名，以确保每次打包提取的模块是相同的

	//	// 假如有以下模块（大写表示入口模块，小写表示外部模块，箭头表示依赖关系）：
	//	// A -> a, b, c, d
	//	// B -> a, b; C
	//	// C -> b; D
	//	// D -> c, d; B
	//	// E -> e; g(动态依赖)
	//	// g -> f; E

	//	// 第一步：生成所有入口模块和动态导入的模块对应的包，并计算入口包之间的依赖关系（删除循环依赖）：
	//	// A -> a, b, c, d
	//	// B -> a; C
	//	// C -> b
	//	// D -> c, d; B
	//	// E -> e; g(动态依赖)
	//	// g -> f

	//	// 第二步：计算所有提取包公共模块的所有组合方式（左侧表示包的组合，右侧表示该组合可公共的模块）：
	//	// [A, B] -> a
	//	// [A, C] -> b
	//	// [A, D] -> c, d
	//	// [E] -> e
	//	// [async(D)] -> g, f

	//	// 第三步：对所有组合方式按算法设定的优先级排序：
	//	// [A, D] -> c, d
	//	// [A, C] -> b
	//	// [A, B] -> a
	//	// [E] -> e
	//	// [async(D)] -> g, f

	//	// 第四步：按顺序使用所有组合方式，剩下未使用的将被抛弃：
	//	// VENDOR1 -> c, d
	//	// VENDOR2 -> b
	//	// A -> a; VENDOR2; VENDOR1
	//	// B -> a; VENDOR2; C
	//	// C -> VENDOR2; D
	//	// D -> VENDOR1; B
	//	// E -> e; g(动态依赖)
	//	// async(D) -> g, f

	//	/** 缓存一个模块解析后的信息 */
	//	interface ModuleInfo {
	//		/** 所有静态依赖的入口模块列表 */
	//		entryModuleImports?: Set<Module>
	//		/** 所有静态依赖的非入口模块列表 */
	//		staticImports?: Set<Module>
	//		/** 所有动态依赖的模块列表 */
	//		dynamicImports?: Set<Module>
	//		/** 如果当前模块是入口模块，则为关联的包 */
	//		bundle?: Bundle
	//	}
	//	// 存储所有模块数据，将数据单独提取出而不是保存模块自身，是为了打包结束后快速清理内存
	//	const moduleInfos = new Map<Module, ModuleInfo>()
	//	/** 获取指定模块对应的数据 */
	//	function getModuleInfo(module: Module) {
	//		let moduleInfo = moduleInfos.get(module)
	//		if (!moduleInfo) {
	//			moduleInfos.set(module, moduleInfo = {})
	//			if (module.dependencies) {
	//				for (const dependency of module.dependencies) {
	//					const parentModule = dependency.module
	//					// 1. 如果模块解析失败，则 parentModule 为空，忽略
	//					// 2. 只处理 JS 到 JS 的依赖
	//					// 3. 忽略模块循环依赖
	//					if (parentModule && parentModule.type === "js" && parentModule !== module) {
	//						if (dependency.dynamic) {
	//							const dynamicImports = moduleInfo.dynamicImports ||
	//								(moduleInfo.dynamicImports = new Set<Module>())
	//							dynamicImports.add(parentModule)
	//						} else if (parentModule.isEntryModule) {
	//							const mainModuleImports = moduleInfo.entryModuleImports ||
	//								(moduleInfo.entryModuleImports = new Set<Module>())
	//							mainModuleImports.add(parentModule)
	//						} else {
	//							// 合并依赖的依赖
	//							const parentModuleInfo = getModuleInfo(parentModule)
	//							const staticImports = moduleInfo.staticImports ||
	//								(moduleInfo.staticImports = new Set<Module>())
	//							if (parentModuleInfo.staticImports) {
	//								for (const grandParentModule of parentModuleInfo.staticImports) {
	//									if (grandParentModule !== module) {
	//										staticImports.add(grandParentModule)
	//									}
	//								}
	//							}
	//							staticImports.add(parentModule)
	//							if (parentModuleInfo.dynamicImports) {
	//								const dynamicImports = moduleInfo.dynamicImports ||
	//									(moduleInfo.dynamicImports = new Set<Module>())
	//								for (const grandParentModule of parentModuleInfo.dynamicImports) {
	//									if (grandParentModule !== module) {
	//										dynamicImports.add(grandParentModule)
	//									}
	//								}
	//							}
	//							if (parentModuleInfo.entryModuleImports) {
	//								const mainModuleImports = moduleInfo.entryModuleImports ||
	//									(moduleInfo.entryModuleImports = new Set<Module>())
	//								for (const grandParentModule of parentModuleInfo.entryModuleImports) {
	//									if (grandParentModule !== module) {
	//										mainModuleImports.add(grandParentModule)
	//									}
	//								}
	//							}
	//						}
	//					}
	//				}
	//			}
	//		}
	//		return moduleInfo
	//	}

	//	// 存储所有生成的包
	//	const bundles: Bundle[] = []
	//	// 存储延时处理的动态加载模块
	//	const dynamicModules: ModuleInfo[] = []
	//	// 如果入口模块有循环依赖，算法会保留先处理的模块依赖，删除后处理的模块依赖
	//	// 猜测实际项目中越期望公用的文件路径排名越靠前（比如名为 common）
	//	// 所以应该先处理路径排名靠后的模块，files 是按路径顺序排列的，需要倒序遍历
	//	for (let i = files.length - 1; i >= 0; i--) {
	//		const module = files[i].module!
	//		if (module.type === "js") {
	//			createBundle(module).index = i
	//			while (dynamicModules.length) {
	//				const moduleInfo = dynamicModules.pop()!
	//				for (const dynamicImport of moduleInfo.dynamicImports!) {
	//					if (dynamicImport.isEntryModule) {
	//						createBundle(dynamicImport).type = BundleType.staticOrDynamic
	//					} else {
	//						// 创建一个临时模块，包含源包和目标模块的所有依赖，生成的包会自动排除源包包含的所有模块
	//						const dynamicModule = new DynamicJSModule(files[i], this)
	//						dynamicModule.isEntryModule = true
	//						dynamicModule.addDependency("").module = moduleInfo.bundle!.mainModule
	//						dynamicModule.addDependency("").module = dynamicImport
	//						const dynamicBundle = createBundle(dynamicModule)
	//						dynamicBundle.type = BundleType.dynamic
	//						// 删除 moduleInfo.bundle 的引用
	//						dynamicBundle.parentBundles!.shift()
	//					}
	//				}
	//			}
	//			/** 创建模块对应的包 */
	//			function createBundle(module: Module): Bundle {
	//				const moduleInfo = getModuleInfo(module)
	//				// 如果有其它模块依赖了当前模块，则在处理其它模块时已创建对应的包
	//				let bundle = moduleInfo.bundle
	//				if (!bundle) {
	//					moduleInfo.bundle = bundles[bundles.length] = bundle = new Bundle(bundles.length.toString(), module)
	//					// 包依赖会影响模块依赖，所以先处理包的依赖
	//					if (moduleInfo.entryModuleImports) {
	//						// 标记当前包正在处理，如果此时处理依赖的包时检测到已标记的包，说明存在循环依赖
	//						bundle.creating = true
	//						const parentBundles = bundle.parentBundles || (bundle.parentBundles = [])
	//						for (const parentModule of moduleInfo.entryModuleImports) {
	//							const parentBundle = createBundle(parentModule)
	//							// 删除循环依赖关系
	//							if (parentBundle.creating) {
	//								continue
	//							}
	//							parentBundles.push(parentBundle)
	//						}
	//						delete bundle.creating
	//					}
	//					// 添加初始包包含的模块
	//					if (moduleInfo.staticImports) {
	//						outer: for (const staticImport of moduleInfo.staticImports) {
	//							// 删除在任一父包中已包含的模块
	//							if (bundle.parentBundles) {
	//								for (const parentBundle of bundle.parentBundles) {
	//									const parentModuleInfo = getModuleInfo(parentBundle.mainModule!)
	//									if (parentModuleInfo.staticImports && parentModuleInfo.staticImports.has(staticImport)) {
	//										continue outer
	//									}
	//								}
	//							}
	//							bundle.add(staticImport)
	//						}
	//					}
	//					// 为了避免影响静态包依赖分析，动态加载的模块延时到最后处理
	//					if (moduleInfo.dynamicImports) {
	//						dynamicModules.push(moduleInfo)
	//					}
	//				}
	//				return bundle
	//			}
	//		}
	//	}

	//	/** 表示一种包组合方式 */
	//	interface Combination {
	//		/** 当前组合的唯一标识 */
	//		readonly id: string
	//		/** 要组合的所有包 */
	//		readonly bundles: Bundle[]
	//		/** 当前组合的所有包公共的模块 */
	//		readonly modules: Set<Module>
	//		/** 当前组合内所有模块的大小 */
	//		size?: number
	//	}
	//	// 生成所有公共包
	//	for (const commonModule of this.jsCommonModules) {

	//		// 查找要提取的模块
	//		let selectedModules: Set<Module> | undefined
	//		if (commonModule.matcher) {
	//			selectedModules = new Set<Module>()
	//			for (const [module, moduleInfo] of moduleInfos) {
	//				if (selectedModules.has(module) || !commonModule.matcher.test(module.path)) {
	//					continue
	//				}
	//				// 将模块和模块的依赖加入结果列表
	//				if (moduleInfo.staticImports) {
	//					for (const staticImport of moduleInfo.staticImports) {
	//						selectedModules.add(staticImport)
	//					}
	//				}
	//				selectedModules.add(module)
	//			}
	//		}

	//		// 存储所有可用的组合方式
	//		const moduleCombiniations = new Map<Module, Combination>()
	//		const combinations = new Map<string, Combination>()
	//		for (const bundle of bundles) {
	//			// 跳过不能再提取公共包的包
	//			if ((bundle.parentBundles ? bundle.parentBundles.length : 0) >= (bundle.type === BundleType.dynamic ? commonModule.maxAsyncRequests : commonModule.maxInitialRequests)) {
	//				continue
	//			}
	//			for (const module of bundle) {
	//				// 跳过未筛选的模块
	//				if (selectedModules && !selectedModules.has(module)) {
	//					continue
	//				}
	//				// 如果模块已经属于某个组合，则更新原组合
	//				let id: string
	//				const oldCombination = moduleCombiniations.get(module)
	//				if (oldCombination) {
	//					oldCombination.modules.delete(module)
	//					id = `${oldCombination.id}|${bundle.id}`
	//				} else {
	//					id = bundle.id
	//				}
	//				let combination = combinations.get(id)
	//				if (!combination) {
	//					combinations.set(id, combination = {
	//						id: id,
	//						bundles: oldCombination ? [...oldCombination.bundles, bundle] : [bundle],
	//						modules: new Set<Module>()
	//					})
	//				}
	//				combination.modules.add(module)
	//				moduleCombiniations.set(module, combination)
	//			}
	//		}

	//		if (commonModule.minSize > 0) {
	//			let size = 0
	//			for (const module of moduleCombiniations.keys()) {
	//				size += module.size!
	//			}
	//			if (size < commonModule.minSize) {
	//				continue
	//			}
	//		}

	//		const commonBundle = new Bundle("")
	//		if (Number.isFinite(commonModule.maxSize)) {
	//			// 如果模块的大小被限制，则需要先将组合按大小排序
	//			const combinationsSorted: Combination[] = []
	//			for (const combination of combinations.values()) {
	//				if (combination.bundles.length < commonModule.minUseCount) {
	//					continue
	//				}
	//				combination.size = 0
	//				for (const module of combination.modules) {
	//					combination.size += module.size!
	//				}
	//				insertOrdered(combinationsSorted, combination, (combination1, combination2) => {
	//					// 公共的包数最多
	//					if (combination1.bundles.length !== combination2.bundles.length) {
	//						return combination1.bundles.length > combination2.bundles.length
	//					}
	//					if (combination1.size! !== combination2.size!) {
	//						return combination1.size! > combination2.size!
	//					}
	//					if (combination1.modules.size !== combination2.modules.size) {
	//						return combination1.modules.size > combination2.modules.size
	//					}
	//					// 确保每次打包生成的公共文件完全相同
	//					return combination1.id < combination2.id
	//				})
	//			}
	//			let size = 0
	//			for (const combination of combinationsSorted) {
	//				size += combination.size!
	//				// 将公共的模块从原包移除然后添加到公共包
	//				if (size >= commonModule.maxSize) {
	//					size -= combination.size!
	//					for (const module of Array.from(combination.modules).sort((x, y) => y.size! - x.size!)) {
	//						if (size + module.size! < commonModule.maxSize) {
	//							size += module.size!
	//							addModuleToCommonBundle(module, commonBundle, combination)
	//						}
	//					}
	//					break
	//				} else {
	//					for (const module of combination.modules) {
	//						addModuleToCommonBundle(module, commonBundle, combination)
	//					}
	//				}
	//			}
	//		} else {
	//			for (const combination of combinations.values()) {
	//				// 可复用包次数不符合要求
	//				if (combination.bundles.length < commonModule.minUseCount) {
	//					// 将公共的模块从原包移除然后添加到公共包
	//					for (const module of combination.modules) {
	//						addModuleToCommonBundle(module, commonBundle, combination)
	//					}
	//				}
	//			}
	//		}

	//		/** 将模块移到公共包 */
	//		function addModuleToCommonBundle(module: Module, commonBundle: Bundle, combination: Combination) {
	//			commonBundle.add(module)
	//			for (const bundle of combination.bundles) {
	//				bundle.delete(module)
	//				const parentBundles = bundle.parentBundles || (bundle.parentBundles = [])
	//				parentBundles.push(bundle)
	//			}
	//		}
	//	}
	//}

	// #endregion

}

/** 表示 JS 模块打包器的选项 */
export interface JSBundlerOptions extends BundlerOptions {
	/** 提取 JS 公共模块的规则 */
	commonModules?: boolean | CommonJSModuleRule[]
	/** 是否提取 JS 模块中的 CSS 模块 */
	extractCSSModules?: boolean
	/**
	 * 是否启用删除无用的导出
	 * @default true
	 */
	treeShaking?: boolean
	/**
	 * 是否启用作用域提升
	 * @default true
	 */
	scopeHoisting?: boolean
}

/** 表示一个 JS 公共模块拆分规则 */
export interface CommonJSModuleRule {
	/** 匹配源模块的模式，可以是通配符或正则表达式等 */
	match?: Pattern
	/** 要排除构建的源模块的的模式，可以是通配符或正则表达式等 */
	exclude?: Pattern
	/** 要求的模块最低重用次数 */
	minUseCount?: number
	/** 生成的公共模块的最小体积 */
	minSize?: number
	/** 生成的公共模块的最大体积 */
	maxSize?: number
	/** 生成的公共模块路径 */
	outPath: string | ((module: Module) => string)
}

/** 表示提取 CSS 模块的配置 */
export interface ExtractCSSModuleRule {
	/** 匹配源模块的模式，可以是通配符或正则表达式等 */
	match?: Pattern
	/** 要排除构建的源模块的的模式，可以是通配符或正则表达式等 */
	exclude?: Pattern
	/** 提取的路径 */
	outPath: string | ((module: Module, builder: Builder) => string)
}

/** 已解析的 JS 公共模块拆分规则 */
export interface ResolvedJSCommonModuleRule {
	/** 允许按当前规则拆分的模块匹配器 */
	matcher: Matcher
	/** 要求的模块最低重用次数 */
	minUseCount: number
	/** 生成的公共模块的最小体积 */
	minSize: number
	/** 生成的公共模块的最大体积 */
	maxSize: number
	/** 生成的公共模块路径 */
	outPath: (module: Module) => string
	/** 拆分后源包最多的请求数 */
	maxInitialRequests: number
	/** 拆分后源包最多的异步请求数 */
	maxAsyncRequests: number
	/** 是否拆为全局的公共模块 */
	global: boolean
}

/** 表示已解析的提取 CSS 模块的配置 */
export interface ResolvedExtractCSSModuleRule {
	/** 匹配的模块匹配器 */
	matcher?: Matcher
	/** 提取的路径 */
	outPath: (module: Module, builder: Builder) => string
}

/** 表示一个 JS 模块 */
export interface JSModule extends TextModule {

	// 	/** 模块中用到的外部变量（如 "$"） */
	// 	readonly externals: string[] = []

	// 	/** 模块中的所有导出语句 */
	// 	readonly exports: string[]

}

/** 表示一个资源模块包 */
export class Bundle extends Set<Module> {

	/** 获取包的 ID */
	readonly id: string

	/** 获取当前包的入口模块，如果当前包是提取的公共包则为 `undefined` */
	readonly entryModule?: Module

	/**
	 * 初始化新的模块包
	 * @param id ID
	 * @param entryModule 主模块
	 */
	constructor(id: string, entryModule?: Module) {
		super()
		this.id = id
		this.entryModule = entryModule
	}

	/** 获取或设置当前包的所有父包 */
	parentBundles?: Bundle[]

	/** 获取或设置包的类型 */
	type = BundleType.static

	/** 判断或设置当前包是否正在创建 */
	creating?: boolean

}

/** 表示包的类型 */
export const enum BundleType {
	/** 只会通过静态导入的包 */
	static = 1,
	/** 只会通过动态导入的包 */
	dynamic = 2,
	/** 既可通过静态又可通过动态导入的包 */
	staticOrDynamic = 3
}

/** 表示一个 JS 模块解析器 */
export class JSModuleRenderer {

	/** 获取要渲染的目标模块 */
	protected module!: JSModule

	/**
	 * 渲染指定的模块
	 * @param module 渲染的目标模块
	 * @param node 要渲染的节点
	 */
	render(module: JSModule, node: ESTree.Program) {
		this.module = module
		this.currentScope = undefined!
		this.Program(node)
	}

	// #region 编译时常量

	/** 全局定义的常量 */
	readonly globalDefines = new Map<string, any>()

	/** 全局定义的常量 */
	readonly globalDefineProps = new Set<string>()

	/** 全局定义的 typeof 定义 */
	readonly globalTypeof = new Map<string, any>()

	/**
	 * 定义指定的编译时常量
	 * @param name 要定义的变量名或调用表达式或 typeof 表达式
	 * @param value 要定义的常量值
	 */
	define(name: string, value: any) {
		const match = /^typeof\s+/.exec(name)
		if (match) {
			this.globalTypeof.set(name.substring(match[0].length), value)
			return
		}
		const dotIndex = name.lastIndexOf(".")
		if (dotIndex >= 0) {
			this.globalDefineProps.add(name.substring(dotIndex + 1))
		}
		this.globalDefines.set(name, value)
	}

	/**
	 * 获取指定节点编译后的常量
	 * @param node 要查询的名称
	 */
	protected getDefined(node: ESTree.Node) {

	}

	/**
	 * 获取指定节点编译后的常量
	 * @param node 要查询的名称
	 */
	protected getDefinedTypeof(node: ESTree.UnaryExpression & { operator: "typeof" }) {
		if (this.globalTypeof.size) {
			const source = this.getSourceOfMemberExpression(node)
			if (source !== undefined) {
				const value = this.globalTypeof.get(source)
				if (value !== undefined) {
					return value
				}
			}
		}
		return undefined
	}

	private getSourceOfMemberExpression(node: ESTree.Node): string | undefined {
		switch (node.type) {
			case "Identifier":
				return node.name
			case "MemberExpression":
				if (node.computed || node.property.type !== "Identifier") {
					return undefined
				}
				const callee = this.getSourceOfMemberExpression(node.object)
				if (callee === undefined) {
					return undefined
				}
				return `${callee}.${node.property.name}`
			default:
				return undefined
		}
	}

	// #endregion

	// #region 作用域

	/** 获取当前的作用域 */
	protected currentScope!: Scope

	/** 获取当前的函数作用域 */
	protected get currentTopScope() {
		let scope = this.currentScope
		while (!scope.top) {
			scope = scope.parent!
		}
		return scope
	}

	/**
	 * 进入一个新的词法作用域
	 * @param top 是否是函数顶级作用域
	 */
	protected enterScope(top: boolean) {
		return this.currentScope = new Scope(this.currentScope, top)
	}

	/** 退出当前作用域 */
	protected exitScope() {
		return this.currentScope = this.currentScope.parent!
	}

	/**
	 * 等待当前作用域已解析后继续
	 * @param callback 等待的回调
	 */
	protected onScopeReady(callback: () => void) {
		const scope = this.currentTopScope
		if (scope.readyCallbacks) {
			scope.readyCallbacks.push(callback)
		} else {
			scope.readyCallbacks = [callback]
		}
	}

	/**
	 * 判断当前作用域是否绑定了指定名称
	 * @param name 要判断的名称
	 */
	protected hasBinding(name: string) {
		for (let scope = this.currentScope; scope; scope = scope.parent!) {
			if (scope.has(name)) {
				return true
			}
		}
		return false
	}

	/**
	 * 根据指定的节点在当前作用域添加
	 * @param node 要添加的节点
	 * @param scope 要添加的目标作用域
	 */
	protected addBindings(node: ESTree.Pattern | ESTree.AssignmentProperty, scope: Scope) {
		switch (node.type) {
			case "Identifier":
				scope.set(node.name, node)
				break
			case "ArrayPattern":
				for (const element of node.elements) {
					this.addBindings(element!, scope)
				}
				break
			case "ObjectPattern":
				for (const property of node.properties) {
					this.addBindings(property, scope)
				}
				break
			case "MemberExpression":
				// todo
				break
			case "AssignmentPattern":
				this.addBindings(node.left, scope)
				break
			case "RestElement":
				this.addBindings(node.argument, scope)
				break
			case "Property":
				this.addBindings(node.value, scope)
				break

		}
	}

	// #endregion

	// #region 节点渲染器

	// #region 全局

	/**
	 * 渲染指定的节点
	 * @param node 要渲染的节点
	 */
	protected renderNode(node: ESTree.Node) {
		return (this[node.type] as ((node: ESTree.Node) => ESTree.Literal["value"] | typeof undefined) || this.undefined).call(this, node)
	}

	/**
	 * 渲染指定的节点列表
	 * @param nodeList 要渲染的节点列表
	 */
	protected renderNodeList(nodeList: ESTree.Node[]) {
		for (const node of nodeList) {
			this.renderNode(node)
		}
		return undefined
	}

	/**
	 * 渲染指定的未知节点
	 * @param node 要渲染的节点
	 */
	protected undefined(node: ESTree.Node) {
		for (const key in node) {
			const value = (node as any)[key]
			if (typeof value === "object" && value && typeof value.type === "string") {
				this.renderNode(value)
			}
		}
		return undefined
	}

	/**
	 * 渲染指定的语法树
	 * @param node 要渲染的节点
	 */
	protected Program(node: ESTree.Program) {
		this.enterScope(true)
		this.renderNodeList(node.body)
		this.exitScope()
	}

	// #endregion

	// #region 字面量

	/**
	 * 渲染指定的字面量
	 * @param node 要渲染的节点
	 */
	protected Literal(node: ESTree.Literal) {
		return node.value
	}

	/**
	 * 渲染指定的数字字面量
	 * @param node 要渲染的节点
	 */
	protected NumberLiteral(node: ESTree.Literal & { value: number }) {
		return node.value
	}

	/**
	 * 渲染指定的大数字面量
	 * @param node 要渲染的节点
	 */
	protected BigIntLiteral(node: ESTree.BigIntLiteral) {
		return node.value
	}

	/**
	 * 渲染指定的字符串字面量
	 * @param node 要渲染的节点
	 */
	protected StringLiteral(node: ESTree.Literal & { value: string }) {
		return node.value
	}

	/**
	 * 渲染指定的模板字面量
	 * @param node 要渲染的节点
	 */
	protected TemplateLiteral(node: ESTree.TemplateLiteral) {
		let expressions: any[] | typeof undefined = []
		for (let i = 0; i < node.expressions.length; i++) {
			const value = this.renderNode(node.expressions[i])
			if (expressions === undefined) {
				continue
			}
			if (value === undefined) {
				expressions = undefined
				continue
			}
			expressions[i] = value
		}
		if (expressions === undefined) {
			return undefined
		}
		let value = this.TemplateElement(node.quasis[0])
		for (let i = 0; i < node.quasis.length; i++) {
			value += expressions[i]
			value += this.TemplateElement(node.quasis[i + 1])
		}
		return value
	}

	/**
	 * 渲染指定的标签模板字面量
	 * @param node 要渲染的节点
	 */
	protected TaggedTemplateExpression(node: ESTree.TaggedTemplateExpression) {
		this.renderNode(node.tag)
		this.TemplateLiteral(node.quasi)
		return undefined
	}

	/**
	 * 渲染指定的模板元素
	 * @param node 要渲染的节点
	 */
	protected TemplateElement(node: ESTree.TemplateElement) {
		return node.value.cooked!
	}

	/**
	 * 渲染指定的布尔字面量
	 * @param node 要渲染的节点
	 */
	protected BooleanLiteral(node: ESTree.Literal & { value: boolean }) {
		return node.value
	}

	/**
	 * 渲染指定的空字面量
	 * @param node 要渲染的节点
	 */
	protected NullLiteral(node: ESTree.Literal & { value: null }) {
		return node.value
	}

	/**
	 * 渲染指定的正则表达式字面量
	 * @param node 要渲染的节点
	 */
	protected RegExpLiteral(node: ESTree.RegExpLiteral) {
		return node.value
	}

	/**
	 * 渲染指定的数组字面量
	 * @param node 要渲染的节点
	 */
	protected ArrayExpression(node: ESTree.ArrayExpression) {
		return this.renderNodeList(node.elements as ESTree.Node[])
	}

	/**
	 * 渲染指定的展开元素
	 * @param node 要渲染的节点
	 */
	protected SpreadElement(node: ESTree.SpreadElement) {
		return this.renderNode(node.argument)
	}

	/**
	 * 渲染指定的对象字面量
	 * @param node 要渲染的节点
	 */
	protected ObjectExpression(node: ESTree.ObjectExpression) {
		return this.renderNodeList(node.properties)
	}

	/**
	 * 渲染指定的属性节点
	 * @param node 要渲染的节点
	 */
	protected Property(node: ESTree.Property) {
		this.renderNode(node.key)
		if (!node.shorthand) {
			this.renderNode(node.value!)
		}
		return undefined
	}

	/**
	 * 渲染指定的函数表达式
	 * @param node 要渲染的节点
	 */
	protected FunctionExpression(node: ESTree.FunctionExpression) {
		const scope = this.enterScope(true)
		if (node.id) {
			this.addBindings(node.id, scope)
		}
		for (const param of node.params) {
			this.addBindings(param, scope)
			if (param.type === "AssignmentPattern") {
				this.renderNode(param.right)
			}
			// todo: 其它语法
		}
		this.BlockStatement(node.body)
		this.exitScope()
	}

	/**
	 * 渲染指定的箭头函数字面量
	 * @param node 要渲染的节点
	 */
	protected ArrowFunctionExpression(node: ESTree.ArrowFunctionExpression) {

	}

	/**
	 * 渲染指定的类表达式
	 * @param node 要渲染的节点
	 */
	protected ClassExpression(node: ESTree.ClassExpression) {

	}

	/**
	 * 渲染指定的标识符
	 * @param node 要渲染的节点
	 */
	protected Identifier(node: ESTree.Identifier) {
		if (node.name === "process" && !this.hasBinding(node.name)) {
			const dep = this.module.addDependency({
				type: ModuleDependencyType.staticImport,
				url: "process",
				index: node.start!,
				endIndex: node.end!,
				source: "process"
			})
			this.module.document.insert(0, () => {
				const resolvedFile = dep.resolvedFile
				if (resolvedFile) {
					const module = resolvedFile.getProp(Module) as Module
					if (module) {
						return `var process = require(${quoteJSString(module.id)});`
					}
				}
				return ""
			})
		}

		// const binding = this.getBinding(node.name)
		// if (binding) {

		// } else {
		// 	// 可能是预定义的全局变量

		// }
	}

	// #endregion

	// #region JSX

	/**
	 * 渲染指定的 JSX 标识符
	 * @param node 要渲染的节点
	 */
	protected JSXIdentifier(node: ESTree.JSXIdentifier) {

	}

	/**
	 * 渲染指定的 JSX 成员调用表达式
	 * @param node 要渲染的节点
	 */
	protected JSXMemberExpression(node: ESTree.JSXMemberExpression) {

	}

	/**
	 * 渲染指定的 JSX 命名空间
	 * @param node 要渲染的节点
	 */
	protected JSXNamespacedName(node: ESTree.JSXNamespacedName) {

	}

	/**
	 * 渲染指定的 JSX 表达式
	 * @param node 要渲染的节点
	 */
	protected JSXEmptyExpression(node: ESTree.JSXEmptyExpression) {

	}

	/**
	 * 渲染指定的 JSX 表达式容器
	 * @param node 要渲染的节点
	 */
	protected JSXExpressionContainer(node: ESTree.JSXExpressionContainer) {

	}

	/**
	 * 渲染指定的 JSX 展开子元素
	 * @param node 要渲染的节点
	 */
	protected JSXSpreadChild(node: ESTree.JSXSpreadChild) {

	}

	/**
	 * 渲染指定的 JSX 文本
	 * @param node 要渲染的节点
	 */
	protected JSXText(node: ESTree.JSXText) {

	}

	/**
	 * 渲染指定的 JSX 元素
	 * @param node 要渲染的节点
	 */
	protected JSXElement(node: ESTree.JSXElement) {

	}

	/**
	 * 渲染指定的 JSX 打开元素
	 * @param node 要渲染的节点
	 */
	protected JSXOpeningElement(node: ESTree.JSXOpeningElement) {

	}

	/**
	 * 渲染指定的 JSX 关闭元素
	 * @param node 要渲染的节点
	 */
	protected JSXClosingElement(node: ESTree.JSXClosingElement) {

	}

	/**
	 * 渲染指定的 JSX 属性
	 * @param node 要渲染的节点
	 */
	protected JSXAttribute(node: ESTree.JSXAttribute) {

	}

	/**
	 * 渲染指定的 JSX 展开属性
	 * @param node 要渲染的节点
	 */
	protected JSXSpreadAttribute(node: ESTree.JSXSpreadAttribute) {

	}

	/**
	 * 渲染指定的 JSX 片段
	 * @param node 要渲染的节点
	 */
	protected JSXFragment(node: ESTree.JSXFragment) {

	}

	/**
	 * 渲染指定的 JSX 打开片段
	 * @param node 要渲染的节点
	 */
	protected JSXOpeningFragment(node: ESTree.JSXOpeningFragment) {

	}

	/**
	 * 渲染指定的 JSX 关闭片段
	 * @param node 要渲染的节点
	 */
	protected JSXClosingFragment(node: ESTree.JSXClosingFragment) {

	}

	// #endregion

	// #region 表达式

	/**
	 * 渲染指定的单目运算表达式
	 * @param node 要渲染的节点
	 */
	protected UnaryExpression(node: ESTree.UnaryExpression) {
		const operand = this.renderNode(node.argument) as any
		if (operand === undefined) {
			return undefined
		}
		switch (node.operator) {
			case "-":
				return -operand
			case "+":
				return +operand
			case "!":
				return !operand
			case "~":
				return ~operand
			case "typeof":
				return typeof operand
			case "void":
				return undefined
			default:
				return undefined
		}
	}

	/**
	 * 渲染指定的双目运算表达式
	 * @param node 要渲染的节点
	 */
	protected BinaryExpression(node: ESTree.BinaryExpression) {
		const leftOperand = this.renderNode(node.left) as any
		const rightOperand = this.renderNode(node.right) as any
		if (leftOperand === undefined || rightOperand === undefined) {
			return undefined
		}
		switch (node.operator) {
			case "===":
				return leftOperand === rightOperand
			case "!==":
				return leftOperand !== rightOperand
			case "+":
				return leftOperand + rightOperand
			case "<":
				return leftOperand < rightOperand
			case "<=":
				return leftOperand <= rightOperand
			case ">":
				return leftOperand > rightOperand
			case ">=":
				return leftOperand >= rightOperand
			case "==":
				return leftOperand == rightOperand
			case "!=":
				return leftOperand != rightOperand
			case "-":
				return leftOperand - rightOperand
			case "*":
				return leftOperand * rightOperand
			case "/":
				return leftOperand / rightOperand
			case "%":
				return leftOperand % rightOperand
			case "**":
				return leftOperand ** rightOperand
			case "|":
				return leftOperand | rightOperand
			case "<<":
				return leftOperand << rightOperand
			case ">>":
				return leftOperand >> rightOperand
			case ">>>":
				return leftOperand >>> rightOperand
			case "^":
				return leftOperand ^ rightOperand
			case "&":
				return leftOperand & rightOperand
			default:
				return undefined
		}
	}

	/**
	 * 渲染指定的逻辑运算表达式
	 * @param node 要渲染的节点
	 */
	protected LogicalExpression(node: ESTree.LogicalExpression) {
		const leftOperand = this.renderNode(node.left) as any
		if (leftOperand !== undefined) {
			// false && <expr> -> false
			// true || <expr> -> true
			if (node.operator === "&&" && !leftOperand || node.operator === "||" && leftOperand) {
				this.module.document.remove(node.left.end!, node.right.end!)
				return leftOperand
			}
		}
		this.renderNode(node.right) as any
		return undefined
	}

	/**
	 * 渲染指定的赋值运算表达式
	 * @param node 要渲染的节点
	 */
	protected AssignmentExpression(node: ESTree.AssignmentExpression) {
		this.renderNode(node.left)
		this.renderNode(node.right)
	}

	/**
	 * 渲染指定的增量表达式
	 * @param node 要渲染的节点
	 */
	protected UpdateExpression(node: ESTree.UpdateExpression) {
		this.renderNode(node.argument!)
	}

	/**
	 * 渲染指定的 this 表达式
	 * @param node 要渲染的节点
	 */
	protected ThisExpression(node: ESTree.ThisExpression) {
		return undefined
	}

	/**
	 * 渲染指定的 super 表达式
	 * @param node 要渲染的节点
	 */
	protected Super(node: ESTree.Super) {
		return undefined
	}

	/**
	 * 渲染指定的成员访问表达式
	 * @param node 要渲染的节点
	 */
	protected MemberExpression(node: ESTree.MemberExpression) {
		this.renderNode(node.object)
		this.renderNode(node.property)
	}

	/**
	 * 渲染指定的函数调用表达式
	 * @param node 要渲染的节点
	 */
	protected CallExpression(node: ESTree.CallExpression) {
		if (node.callee.type === "Identifier" && node.callee.name === "require" && node.arguments.length > 0) {
			const firstArgument = node.arguments[0]

			if (firstArgument.type === "Literal" && typeof firstArgument.value === "string" || firstArgument.type === "StringLiteral" as any as "Literal") {
				if (!this.hasBinding("require")) {
					const dep = this.module.addDependency(firstArgument.value as string, firstArgument.start! + 1, firstArgument.end! - 1, "require")
					this.module.replace(firstArgument.start!, firstArgument.end!, () => {
						const resolvedFile = dep.resolvedFile
						if (resolvedFile) {
							const module = resolvedFile.getProp(Module) as Module
							if (module) {
								return quoteJSString(module.id)
							}
						}
						return this.module.content.substring(firstArgument.start!, firstArgument.end!)
					})
				}
			}
		} else {
			this.renderNode(node.callee)
			this.renderNodeList(node.arguments)
		}
	}

	/**
	 * 渲染指定的 new 表达式
	 * @param node 要渲染的节点
	 */
	protected NewExpression(node: ESTree.NewExpression) {
		this.renderNode(node.callee)
		this.renderNodeList(node.arguments)
	}

	/**
	 * 渲染指定的条件表达式
	 * @param node 要渲染的节点
	 */
	protected ConditionalExpression(node: ESTree.ConditionalExpression) {
		const condition = this.renderNode(node.test) as any
		if (condition !== undefined) {
			// false && <expr> -> false
			// true || <expr> -> true
			if (condition) {
				const thenValue = this.renderNode(node.consequent)
				this.module.replace(node.alternate.start!, node.alternate.end!, "false")
				return thenValue
			} else {
				const elseValue = this.renderNode(node.alternate)
				this.module.replace(node.consequent.start!, node.consequent.end!, "false")
				return elseValue
			}
		}
		this.renderNode(node.consequent)
		this.renderNode(node.alternate)
		return undefined
	}

	/**
	 * 渲染指定的逗号表达式
	 * @param node 要渲染的节点
	 */
	protected SequenceExpression(node: ESTree.SequenceExpression) {
		let value: any
		for (const expression of node.expressions) {
			value = this.renderNode(expression)
		}
		return value
	}

	/**
	 * 渲染指定的 await 表达式
	 * @param node 要渲染的节点
	 */
	protected AwaitExpression(node: ESTree.AwaitExpression) {
		this.renderNode(node.argument)
	}

	/**
	 * 渲染指定的 yield 表达式
	 * @param node 要渲染的节点
	 */
	protected YieldExpression(node: ESTree.YieldExpression) {
		this.renderNode(node.argument!)
	}

	/**
	 * 渲染指定的 import.meta 表达式
	 * @param node 要渲染的节点
	 */
	protected MetaProperty(node: ESTree.MetaProperty) {

	}

	/**
	 * 渲染指定的 do 表达式
	 * @param node 要渲染的节点
	 */
	protected DoExpression(node: ESTree.DoExpression) {
		this.renderNode(node.body)
	}

	// #endregion

	// #region 声明

	/**
	 * 渲染指定的导入声明
	 * @param node 要渲染的节点
	 */
	protected ImportDeclaration(node: ESTree.ImportDeclaration) {
		// node.specifiers
	}

	/**
	 * 渲染指定的导入声明符
	 * @param node 要渲染的节点
	 */
	protected ImportSpecifier(node: ESTree.ImportSpecifier) {

	}

	/**
	 * 渲染指定的默认导入声明符
	 * @param node 要渲染的节点
	 */
	protected ImportDefaultSpecifier(node: ESTree.ImportDefaultSpecifier) {

	}

	/**
	 * 渲染指定的命名空间导入声明符
	 * @param node 要渲染的节点
	 */
	protected ImportNamespaceSpecifier(node: ESTree.ImportNamespaceSpecifier) {

	}

	/**
	 * 渲染指定的导入节点
	 * @param node 要渲染的节点
	 */
	protected Import(node: ESTree.Import) {
		// node.specifiers
	}

	/**
	 * 渲染指定的导出声明
	 * @param node 要渲染的节点
	 */
	protected ExportNamedDeclaration(node: ESTree.ExportNamedDeclaration) {

	}

	/**
	 * 渲染指定的导出声明符
	 * @param node 要渲染的节点
	 */
	protected ExportSpecifier(node: ESTree.ExportSpecifier) {

	}

	/**
	 * 渲染指定的默认导出声明符
	 * @param node 要渲染的节点
	 */
	protected ExportDefaultDeclaration(node: ESTree.ExportDefaultDeclaration) {

	}

	/**
	 * 渲染指定的导出全部声明
	 * @param node 要渲染的节点
	 */
	protected ExportAllDeclaration(node: ESTree.ExportAllDeclaration) {

	}

	/**
	 * 渲染指定的变量声明
	 * @param node 要渲染的节点
	 */
	protected VariableDeclaration(node: ESTree.VariableDeclaration) {
		const top = node.kind === "var" ? this.currentTopScope : this.currentScope
		for (const declarator of node.declarations) {
			this.addBindings(declarator.id, top)
			if (declarator.init) {
				this.renderNode(declarator.init)
			}
		}
	}

	/**
	 * 渲染指定的变量声明符
	 * @param node 要渲染的节点
	 */
	protected VariableDeclarator(node: ESTree.VariableDeclarator) {

	}

	/**
	 * 渲染指定的数组析构模式
	 * @param node 要渲染的节点
	 */
	protected ArrayPattern(node: ESTree.ArrayPattern) {

	}

	/**
	 * 渲染指定的对象析构模式
	 * @param node 要渲染的节点
	 */
	protected ObjectPattern(node: ESTree.ObjectPattern) {

	}

	/**
	 * 渲染指定的赋值析构模式
	 * @param node 要渲染的节点
	 */
	protected AssignmentPattern(node: ESTree.AssignmentPattern) {

	}

	/**
	 * 渲染指定的在展开析构模式
	 * @param node 要渲染的节点
	 */
	protected RestElement(node: ESTree.RestElement) {

	}

	/**
	 * 渲染指定的函数声明
	 * @param node 要渲染的节点
	 */
	protected FunctionDeclaration(node: ESTree.FunctionDeclaration) {

	}

	/**
	 * 渲染指定的类声明
	 * @param node 要渲染的节点
	 */
	protected ClassDeclaration(node: ESTree.ClassDeclaration) {

	}

	/**
	 * 渲染指定的类主体
	 * @param node 要渲染的节点
	 */
	protected ClassBody(node: ESTree.ClassBody) {

	}

	/**
	 * 渲染指定的类方法声明
	 * @param node 要渲染的节点
	 */
	protected MethodDefinition(node: ESTree.MethodDefinition) {

	}

	/**
	 * 渲染指定的字段声明
	 * @param node 要渲染的节点
	 */
	protected FieldDefinition(node: ESTree.FieldDefinition) {
		if (node.value) {
			this.renderNode(node.value)
		}
	}

	/**
	 * 渲染指定的私有字段声明
	 * @param node 要渲染的节点
	 */
	protected PrivateName(node: ESTree.PrivateName) {

	}

	/**
	 * 渲染指定的注解
	 * @param node 要渲染的节点
	 */
	protected Decorator(node: ESTree.Decorator) {

	}

	// #endregion

	// #region 语句

	/**
	 * 渲染指定的块语句
	 * @param node 要渲染的节点
	 */
	protected BlockStatement(node: ESTree.BlockStatement) {
		this.renderNodeList(node.body)
	}

	/**
	 * 渲染指定的分号
	 * @param node 要渲染的节点
	 */
	protected EmptyStatement(node: ESTree.EmptyStatement) {

	}

	/**
	 * 渲染指定的 if 语句
	 * @param node 要渲染的节点
	 */
	protected IfStatement(node: ESTree.IfStatement) {
		const condition = this.renderNode(node.test)
		if (condition !== undefined) {
			if (condition) {
				this.renderNode(node.consequent)
			} else if (node.alternate) {
				this.renderNode(node.alternate)
			}
			return
		}
		this.renderNode(node.consequent)
		if (node.alternate) {
			this.renderNode(node.alternate)
		}
	}

	/**
	 * 渲染指定的 switch 语句
	 * @param node 要渲染的节点
	 */
	protected SwitchStatement(node: ESTree.SwitchStatement) {

	}

	/**
	 * 渲染指定的 switch case 或 default 分句
	 * @param node 要渲染的节点
	 */
	protected SwitchCase(node: ESTree.SwitchCase) {

	}

	/**
	 * 渲染指定的 while 语句
	 * @param node 要渲染的节点
	 */
	protected WhileStatement(node: ESTree.WhileStatement) {
		const condition = this.renderNode(node.test)
		if (!condition) {
			return
		}
		this.renderNode(node.body)
	}

	/**
	 * 渲染指定的 do..while 语句
	 * @param node 要渲染的节点
	 */
	protected DoWhileStatement(node: ESTree.DoWhileStatement) {
		this.renderNode(node.test)
		this.renderNode(node.body)
	}

	/**
	 * 渲染指定的 for 语句
	 * @param node 要渲染的节点
	 */
	protected ForStatement(node: ESTree.ForStatement) {
		this.enterScope(false)
		if (node.init) {
			this.renderNode(node.init)
		}
		if (node.test) {
			const condition = this.renderNode(node.test)
			if (!condition) {
				return
			}
		}
		if (node.update) {
			this.renderNode(node.update)
		}
		this.renderNode(node.body)
		this.exitScope()
	}

	/**
	 * 渲染指定的 for..in 语句
	 * @param node 要渲染的节点
	 */
	protected ForInStatement(node: ESTree.ForInStatement) {
		this.enterScope(false)
		this.renderNode(node.left)
		this.renderNode(node.right)
		this.renderNode(node.body)
		this.exitScope()
	}

	/**
	 * 渲染指定的 for..of 语句
	 * @param node 要渲染的节点
	 */
	protected ForOfStatement(node: ESTree.ForOfStatement) {
		this.enterScope(false)
		this.renderNode(node.left)
		this.renderNode(node.right)
		this.renderNode(node.body)
		this.exitScope()
	}

	/**
	 * 渲染指定的 break 语句
	 * @param node 要渲染的节点
	 */
	protected BreakStatement(node: ESTree.BreakStatement) {

	}

	/**
	 * 渲染指定的 continue 语句
	 * @param node 要渲染的节点
	 */
	protected ContinueStatement(node: ESTree.ContinueStatement) {

	}

	/**
	 * 渲染指定的 return 语句
	 * @param node 要渲染的节点
	 */
	protected ReturnStatement(node: ESTree.ReturnStatement) {
		if (node.argument) {
			this.renderNode(node.argument)
		}
	}

	/**
	 * 渲染指定的 try 语句
	 * @param node 要渲染的节点
	 */
	protected TryStatement(node: ESTree.TryStatement) {
		this.renderNode(node.block)
		if (node.handler) {
			this.renderNode(node.handler)
		}
		if (node.finalizer) {
			this.renderNode(node.finalizer)
		}
	}

	/**
	 * 渲染指定的 catch 分句
	 * @param node 要渲染的节点
	 */
	protected CatchClause(node: ESTree.CatchClause) {
		// this.addBindings(node.param)
		this.renderNode(node.body)
	}

	/**
	 * 渲染指定的 throw 语句
	 * @param node 要渲染的节点
	 */
	protected ThrowStatement(node: ESTree.ThrowStatement) {
		this.renderNode(node.argument)
	}

	/**
	 * 渲染指定的标签语句
	 * @param node 要渲染的节点
	 */
	protected LabeledStatement(node: ESTree.LabeledStatement) {
		this.renderNode(node.body)
	}

	/**
	 * 渲染指定的 debugger 语句
	 * @param node 要渲染的节点
	 */
	protected DebuggerStatement(node: ESTree.DebuggerStatement) {

	}

	/**
	 * 渲染指定的 with 语句
	 * @param node 要渲染的节点
	 */
	protected WithStatement(node: ESTree.WithStatement) {
		this.renderNode(node.object)
		this.renderNode(node.body)
	}

	/**
	 * 渲染指定的表达式语句
	 * @param node 要渲染的节点
	 */
	protected ExpressionStatement(node: ESTree.ExpressionStatement) {
		this.renderNode(node.expression)
	}

	// #endregion

	// #endregion

}

/** 表示一个词法作用域 */
class Scope extends Map<string, ESTree.Node>{

	/** 获取上级作用域 */
	readonly parent?: Scope

	/** 判断当前作用域是否是函数顶级作用域 */
	readonly top?: boolean

	/**
	 * 初始化新的作用域
	 * @param parent 上级作用域
	 * @param top 是否是函数顶级作用域
	 */
	constructor(parent?: Scope, top?: boolean) {
		super()
		this.parent = parent
		this.top = top
	}

	/** 获取当前作用域已解析完成的所有回调函数 */
	readyCallbacks?: (() => void)[]

}