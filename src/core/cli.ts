import { readFileSync } from "fs"
import { extname, resolve } from "path"
import { wrapString } from "../utils/ansi"
import { transformESModuleToCommonJS } from "../utils/esm"
import { stripBOM } from "../utils/misc"
import { i18n, localeService } from "./i18n"

/**
 * 解析命令行参数
 * @param commandLineOptions 所有内置的命令行选项
 * @param onError 解析出错后的回调函数
 * @param argv 要解析的命令行参数列表
 * @param startIndex 开始解析的索引
 * @returns 返回一个对象，对象的键是参数名或索引，对象的值是对应的参数值（如果没有参数值则为 `true`）
 * @example parseCommandLineArguments({}, undefined, ["--x", "foo", "--y"], 0) // {"--x": "foo", "--y": true}
 * @example parseCommandLineArguments({}, undefined, ["foo"], 0) // {"0": "foo"}
 * @example parseCommandLineArguments({"--full": {alias: "-f"}}, undefined, ["-x"], 0) // {"--full": true}
 */
export function parseCommandLineArguments(commandLineOptions?: { [option: string]: CommandLineOption }, onError?: (message: string) => void, argv = process.argv, startIndex = 2) {
	const result: { [option: string]: string | string[] | true | typeof result } = { __proto__: null! }
	let index = 0
	for (; startIndex < argv.length; startIndex++) {
		let argument = argv[startIndex]
		if (argument.charCodeAt(0) === 45 /*-*/) {
			// -- 后的参数直接解析成键值对
			if (argument === "--") {
				result["--"] = parseCommandLineArguments(undefined, onError, argv, startIndex + 1)
				break
			}
			let value: string | undefined
			// 将 --x=a 转为 --x a
			const equalIndex = argument.search(/[=:]/)
			if (equalIndex >= 0) {
				value = argument.substring(equalIndex + 1)
				argument = argument.substring(0, equalIndex)
			}
			// 查找关联的选项配置
			let key = argument
			let commandLineOption: CommandLineOption | undefined
			if (commandLineOptions) {
				commandLineOption = commandLineOptions[argument]
				if (!commandLineOption) {
					for (const currentKey in commandLineOptions) {
						const current = commandLineOptions[currentKey]
						if (current.alias) {
							if (Array.isArray(current.alias)) {
								if (current.alias.indexOf(argument) >= 0) {
									key = currentKey
									commandLineOption = current
									break
								}
							} else if (current.alias === argument) {
								key = currentKey
								commandLineOption = current
								break
							}
						}
					}
				}
			}
			// 读取选项值
			const oldValue = result[key]
			if (commandLineOption) {
				if (commandLineOption.argument) {
					if (value === undefined) {
						if (startIndex + 1 < argv.length && argv[startIndex + 1].charCodeAt(0) !== 45 /*-*/) {
							value = argv[++startIndex]
						} else if (commandLineOption.default !== undefined) {
							value = commandLineOption.default
						} else {
							onError && onError(i18n`Option '${argument}' requires an argument`)
							continue
						}
					}
					if (commandLineOption.multipy) {
						if (oldValue) {
							(oldValue as string[]).push(value!)
						} else {
							result[key] = [value!]
						}
					} else {
						if (oldValue !== undefined) {
							onError && onError(i18n`Duplicate option '${argument}'`)
						}
						result[key] = value!
					}
				} else if (oldValue && !commandLineOption.multipy) {
					onError && onError(i18n`Duplicate option '${argument}'`)
				} else {
					if (value !== undefined) {
						onError && onError(i18n`Option '${argument}' has no argument, got '${value}'`)
					}
					result[key] = true
				}
			} else {
				if (value === undefined && startIndex + 1 < argv.length && argv[startIndex + 1].charCodeAt(0) !== 45 /*-*/) {
					value = argv[++startIndex]
				}
				if (value !== undefined) {
					if (Array.isArray(oldValue)) {
						oldValue.push(value)
					} else if (typeof oldValue === "string") {
						result[key] = [oldValue, value]
					} else {
						result[key] = value
					}
				} else if (oldValue === undefined) {
					result[key] = true
				}
			}
		} else {
			result[index++] = argument
		}
	}
	return result
}

/**
 * 格式化所有选项
 * @param commandLineOptions 所有内置的命令行选项
 * @param maxWidth 允许布局的最大宽度（一般地，西文字母宽度为 1，中文文字宽度为 2）
 */
export function formatCommandLineOptions(commandLineOptions: { [option: string]: CommandLineOption }, maxWidth = process.stdout.columns || Infinity) {
	// 计算所有的标题
	const keys = new Map<string, CommandLineOption>()
	let maxColumns = 0
	for (const key in commandLineOptions) {
		const commandOption = commandLineOptions[key]
		if (!commandOption.description) {
			break
		}
		let title = key
		if (commandOption.alias) {
			title = `${Array.isArray(commandOption.alias) ? commandOption.alias.join(", ") : commandOption.alias}, ${title}`
		}
		if (commandOption.argument) {
			title += ` ${commandOption.argument}`
		}
		if (maxColumns < title.length) {
			maxColumns = title.length
		}
		keys.set(title, commandOption)
	}
	// 加上左右各两个空格
	maxColumns += 4
	// 生成最终结果
	let result = ""
	for (const [title, commandOption] of keys.entries()) {
		if (result) {
			result += "\n"
		}
		if (commandOption.group) {
			result += `\n${localeService.translate(commandOption.group)}:\n`
		}
		result += `  ${title.padEnd(maxColumns - 2)}${wrapString(localeService.translate(commandOption.description!) + (commandOption.default ? i18n` [default: ${commandOption.default}]` : ""), 2, maxWidth - maxColumns).join(`\n${" ".repeat(maxColumns)}`)}`
	}
	return result
}

/** 表示一个命令行选项 */
export interface CommandLineOption {
	/** 当前选项所属的分组，主要用于格式化时显示 */
	group?: string
	/** 当前选项的别名 */
	alias?: string | string[]
	/** 当前选项的描述，主要用于格式化时显示 */
	description?: string
	/** 当前选项的参数名，如果未设置说明没有参数 */
	argument?: string
	/** 当前选项的默认值，如果未设置则表示当前选项是必填的 */
	default?: any
	/** 是否允许重复使用当前选项 */
	multipy?: boolean
}

/** 所有支持的文件扩展名 */
export const extensions: { [ext: string]: string } = {
	".mjs": "esm",
	".ts": "ts-node/register",
	".tsx": "ts-node/register",
	".coffee": "coffee-script/register"
}

/**
 * 载入一个配置文件
 * @param path 要载入的配置文件名
 * @param jsModule 是否支持 JS 文件中的 ES Module 语法
 */
export async function loadConfig(path: string, jsModule = true) {
	path = resolve(path)
	const ext = extname(path).toLowerCase()
	const originalLoader = require.extensions[ext]
	const js = jsModule && ext === ".js"
	if (js) {
		require.extensions[".js"] = (module: any, filename) => module._compile(transformESModuleToCommonJS(stripBOM(readFileSync(filename, "utf8"))), filename)
	} else if (!originalLoader) {
		const loaderRegister = extensions[ext]
		if (loaderRegister) {
			require(loaderRegister)
		}
	}
	try {
		return require(path)
	} finally {
		if (js) {
			require.extensions[ext] = originalLoader
		}
	}
}