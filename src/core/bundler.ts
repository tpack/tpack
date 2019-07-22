import { Builder } from "./builder"
import { GeneratedModule, Module, ModuleDependency } from "./module"

/** 表示一个模块打包器 */
export interface Bundler {
	/**
	 * 在使用当前打包器处前是否需要读取模块内容
	 * - `"text"`（默认）: 使用全局设置的编码读取文本内容
	 * - `true`/`"binary"`: 读取二进制数据
	 * - `false`: 不读取模块内容
	 */
	read?: boolean | "binary" | "text"
	/**
	 * 解析指定的模块
	 * @param module 要解析的模块
	 * @param builder 当前的构建器对象
	 */
	parse(module: Module, builder: Builder): void | Promise<void>
	/**
	 * 解析模块中指定依赖对应的绝对路径
	 * @param dependency 要解析的依赖
	 * @param module 要解析的模块
	 * @param builder 当前的构建器对象
	 * @returns 返回解析的绝对路径，如果希望忽略此依赖，则返回 `false`
	 */
	resolve(dependency: ModuleDependency, module: Module, builder: Builder): string | false | null | Promise<string | false | null>
	/**
	 * 计算模块的打包结果
	 * @param entryModules 所有入口模块
	 * @param builder 当前的构建器对象
	 */
	bundle?(entryModules: Module[], builder: Builder): void | Promise<void>
	/**
	 * 合成指定的模块
	 * @param module 要合成的模块
	 * @param generatedModule 合成的目标模块
	 * @param builder 当前的构建器对象
	 */
	generate(module: Module, generatedModule: GeneratedModule, builder: Builder): void | Promise<void>
	/**
	 * 将模块序列化成对象以便持久缓存
	 * @param module 要序列化的模块
	 * @param data 目标对象
	 */
	serialize?(module: Module, data: { [key: string]: any }): void
	/**
	 * 从对象反序列化为模块
	 * @param data 源对象
	 * @param module 要反序列化的对象
	 */
	deserialize?(data: { [key: string]: any }, module: Module): void
}