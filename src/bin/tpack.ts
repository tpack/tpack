#!/usr/bin/env node
import { existsSync, readFileSync } from "fs"
import { dirname, join, resolve } from "path"
import { Builder } from "../core/builder"
import { LogLevel } from "../core/logger"
import { BuilderOptions } from "../core/options"

main()

/** 命令行入口 */
async function main() {

	// 优先使用本地安装的版本
	const localCli = searchFile(["node_modules/tpack/bin/tpack.js"])
	if (localCli && localCli !== __filename && require(localCli) !== exports) {
		return
	}

	// Node >= 10.12 才支持 ES2018
	const { i18n, localeService } = require("../core/i18n") as typeof import("../core/i18n")
	if (/^v\d\.|^v10\.\d\.|^v10\.1[01]\./.test(process.version)) {
		console.error(i18n`TPack requires Node.js >= 10.15, currently ${process.version}`)
		console.log(i18n`Visit https://nodejs.org/ to download the latest version`)
		process.exitCode = -8
		return
	}

	// 禁用未捕获的异步异常警告
	process.on("unhandledRejection", error => {
		if (error) {
			console.error(error instanceof Error ? error.stack : error)
		}
		process.exit(-10)
	})

	// 定义命令行参数
	const { parseCommandLineArguments, formatCommandLineOptions, extensions, loadConfig } = require("../core/cli") as typeof import("../core/cli")
	const commandLineOptions = {
		"--help": {
			group: "Options",
			alias: ["-?", "-h"],
			description: "Show help",
			execute() {
				console.info(i18n`TPack v${version()}`)
				console.info("")
				console.info(i18n`Usage: tpack [task=default] [glob] [options]`)
				console.info(formatCommandLineOptions(commandLineOptions))
			}
		},
		"--version": {
			alias: ["-v", "-V"],
			description: "Show version number",
			execute() {
				console.info(version())
			}
		},

		"--cwd": {
			group: "Configuration Options",
			argument: "<path>",
			description: "Specify the current working directory",
			apply(options: BuilderOptions, argument: string) {
				options.baseDir = resolve(argument)
			}
		},
		"--require": {
			alias: "-r",
			argument: "<module>",
			description: "Preload one or more modules before loading the configuration file",
			multipy: true,
			execute(argument: string[]) {
				for (const module of argument) {
					require(module)
				}
			}
		},
		"--config": {
			argument: "<path>",
			description: "Specify the path to the configuration file [default: tpack.config.js]",
		},
		"--tasks": {
			alias: "-t",
			description: "List tasks in configuration file"
		},
		"--init": {
			argument: "[type]",
			description: "Initialize a new project",
			default: "",
			execute(argument: string) {
				notImplemented("--init")
			}
		},
		"--inspect-brk": {
			alias: ["-d", "--debug"],
			argument: "[[host:]port]",
			description: "Activate inspector on [host:port] and wait for connection",
			default: "127.0.0.1:9229",
			execute(argument: string | boolean, wait?: boolean) {
				const inspector = require("inspector") as typeof import("inspector")
				// 如果正在调试则忽略
				if (inspector.url()) {
					return
				}
				// 解析调试的地址和端口，如果未设置或设置成非法的值，Node 会自动改为默认值
				let host: string | undefined, port: any | undefined
				if (typeof argument === "string") {
					const index = argument.indexOf(":")
					host = index < 0 ? undefined : argument.substring(0, index)
					port = index < 0 ? argument : argument.substring(index + 1)
				}
				// 启动调试并自动在 debugger 处中断
				inspector.open(port, host, wait !== false)
			}
		},
		"--inspect": {
			argument: "[[host:]port]",
			description: "Activate inspector on [host:port]",
			default: "127.0.0.1:9229",
			execute(argument: string | boolean) {
				commandLineOptions["--inspect-brk"].execute(argument, false)
			}
		},

		"--build": {
			group: "Mode Options",
			alias: "-b",
			description: "Build all files and exit, disable watching and development server",
			apply(options: BuilderOptions) {
				options.devServer = options.watch = false
			}
		},
		"--publish": {
			alias: "-p",
			description: "Build all files with optimizers enabled and exit, disable watching and development server",
			apply(options: BuilderOptions) {
				options.devServer = options.watch = false
				options.optimize = true
			}
		},
		"--watch": {
			alias: "-w",
			description: "Watch files and build incrementally",
			apply(options: BuilderOptions) {
				if (!options.watch) {
					options.watch = true
				}
			}
		},
		"--serve": {
			alias: "-s",
			argument: "[[host:]port]",
			description: "Start a local development server",
			default: "0.0.0.0",
			apply(options: BuilderOptions, argument: string) {
				if (options.devServer && typeof options.devServer === "object") {
					options.devServer.url = argument
				} else {
					options.devServer = argument
				}
			}
		},
		"--open": {
			argument: "[app]",
			description: "Open in browser when local development server started",
			default: "",
			apply(options: BuilderOptions, argument: string) {
				if (options.devServer) {
					if (options.devServer === true) {
						options.devServer = {}
					} else if (typeof options.devServer !== "object") {
						options.devServer = { url: options.devServer }
					}
					options.devServer.open = argument || true
				}
			}
		},
		"--check": {
			description: "Build all files, but do not write to disk",
			apply(options: BuilderOptions) {
				options.noWrite = true
			}
		},

		"--filter": {
			group: "Build Options",
			argument: "<glob>",
			description: "Specify the files to build",
			multipy: true,
			apply(options: BuilderOptions, argument: string[]) {
				options.filter = argument
			}
		},
		"--output": {
			alias: "-o",
			argument: "<dir>",
			description: "Specify the output directory",
			apply(options: BuilderOptions, argument: string) {
				options.outDir = resolve(argument)
			}
		},
		"--clean": {
			alias: "-c",
			description: "Clean the output directory before build",
			apply(options: BuilderOptions) {
				options.clean = true
			}
		},
		"--no-clean": {
			description: "Do not clean the output directory before build",
			apply(options: BuilderOptions) {
				options.clean = false
			}
		},
		"--no-path-check": {
			description: "Disable path checking and allow overwriting source files",
			apply(options: BuilderOptions) {
				options.noPathCheck = true
			}
		},
		"--source-map": {
			description: "Generate source maps if available",
			apply(options: BuilderOptions) {
				if (!options.sourceMap) {
					options.sourceMap = true
				}
			}
		},
		"--no-source-map": {
			description: "Disable source maps",
			apply(options: BuilderOptions) {
				options.sourceMap = false
			}
		},
		"--bail": {
			description: "Report the first error as a hard error instead of tolerating it",
			apply(options: BuilderOptions) {
				options.bail = true
			}
		},

		"--silent": {
			group: "Logging Options",
			description: "Prevent all outputs",
			apply(options: BuilderOptions) {
				const loggerOptions = options.logger || (options.logger = {})
				loggerOptions.logLevel = LogLevel.silent
				loggerOptions.progress = false
			}
		},
		"--errors-only": {
			description: "Print errors only",
			apply(options: BuilderOptions) {
				const loggerOptions = options.logger || (options.logger = {})
				loggerOptions.logLevel = LogLevel.error
			}
		},
		"--info-only": {
			description: "Print errors, warnings and important information only",
			apply(options: BuilderOptions) {
				const loggerOptions = options.logger || (options.logger = {})
				loggerOptions.logLevel = LogLevel.info
			}
		},
		"--verbose": {
			description: "Print all outputs",
			apply(options: BuilderOptions) {
				const loggerOptions = options.logger || (options.logger = {})
				loggerOptions.logLevel = LogLevel.debug
			}
		},
		"--colors": {
			description: "Enable colorized outputs",
			apply(options: BuilderOptions) {
				const loggerOptions = options.logger || (options.logger = {})
				loggerOptions.colors = true
			}
		},
		"--no-colors": {
			description: "Disable colorized outputs",
			apply(options: BuilderOptions) {
				const loggerOptions = options.logger || (options.logger = {})
				loggerOptions.colors = false
			}
		},
		"--progress": {
			description: "Show build progress",
			apply(options: BuilderOptions) {
				const loggerOptions = options.logger || (options.logger = {})
				loggerOptions.progress = true
			}
		},
		"--no-progress": {
			description: "Hide build progress",
			apply(options: BuilderOptions) {
				const loggerOptions = options.logger || (options.logger = {})
				loggerOptions.progress = false
			}
		},
		"--full-path": {
			description: "Print absolute paths in outputs",
			apply(options: BuilderOptions) {
				const loggerOptions = options.logger || (options.logger = {})
				loggerOptions.fullPath = true
			}
		},

		"--locale": {
			group: "Advanced Options",
			argument: "<locale>",
			description: "Specify the locale of messages, e.g. zh-CN"
		},
		"--no-es-module": {
			description: "Disable ES6 Module support when loading configuration js file",
		},
		"--no-v8-cache": {
			description: "Disable V8 cache",
		},
		"--parallel": {
			argument: "[number]",
			description: "Build files in parallel",
			default: 1,
			apply(options: BuilderOptions, argument: string) {
				options.parallel = +argument || 1
			}
		},
		"--init-completion": {
			argument: "[bash]",
			description: "Initialize tab completion for current environment",
			default: "bash",
			execute(argument: string) {
				notImplemented("--init-completion")
			}
		},
		"--completion-bash": {
			argument: "<bash>",
			description: "Print completion bash",
			execute(argument: string) {
				notImplemented("--completion-bash")
			}
		},
		"--completion": {
			argument: "<prefix>",
			description: "Print completion",
			execute(argument: string) {
				notImplemented("--completion")
			}
		},

	}

	// 解析命令行参数
	let commandLineErrors: string[] | undefined
	const args = parseCommandLineArguments(commandLineOptions, message => {
		if (commandLineErrors) {
			commandLineErrors.push(message)
		} else {
			commandLineErrors = [message]
		}
	})

	// 更新区域
	if (args["--locale"]) {
		localeService.currentLocale = args["--locale"] as string
		// 更新错误文案
		if (commandLineErrors) {
			commandLineErrors.length = 0
			parseCommandLineArguments(commandLineOptions, message => {
				commandLineErrors!.push(message)
			})
		}
	}

	// 参数错误
	if (commandLineErrors) {
		for (const commandLineError of commandLineErrors) {
			console.error(i18n`CommandLineError: ${commandLineError}`)
		}
		process.exitCode = -1
		return
	}

	// 通用命令
	if (args["--verbose"]) {
		console.info(i18n`Using TPack CLI v${version()} installed at '${dirname(__dirname)}'`)
	}
	if (args["--inspect-brk"]) {
		commandLineOptions["--inspect-brk"].execute(args["--inspect-brk"] as string | boolean)
	} else if (args["--inspect"]) {
		commandLineOptions["--inspect"].execute(args["--inspect"] as string | boolean)
	}
	if (args["--require"]) {
		commandLineOptions["--require"].execute(args["--require"] as string[])
	}

	// 获取任务名
	let taskName = args["0"] as string | undefined
	// 将 tpack [task] *.js 转为 tpack [task] --filter *.js
	let index: number | undefined
	if (taskName && /[\/\\\*\?\.!\[\]\{\}]/.test(taskName)) {
		taskName = undefined
		index = 0
	} else if (/[\/\\\*\?\.!\[\]\{\}]/.test(args["1"] as string)) {
		index = 1
	}
	if (index !== undefined) {
		const filter = (args["--filter"] || (args["--filter"] = [])) as string[]
		do {
			filter.push(args[index++] as string)
		} while (args[index])
	}

	// 全局命令
	if (!taskName) {
		if (args["--help"]) {
			return commandLineOptions["--help"].execute()
		}
		if (args["--version"]) {
			return commandLineOptions["--version"].execute()
		}
		if (args["--init"]) {
			return commandLineOptions["--init"].execute(args["--init"] as string)
		}
		if (args["--completion-bash"]) {
			return commandLineOptions["--completion-bash"].execute(args["--completion-bash"] as string)
		}
		if (args["--init-completion"]) {
			return commandLineOptions["--init-completion"].execute(args["--init-completion"] as string)
		}
	}
	if (!args["--no-v8-cache"] && !args["--debug"]) {
		try {
			require("v8-compile-cache")
		} catch { }
	}

	// 解析配置文件
	const configFile = searchFile(args["--config"] ? [args["--config"] as string] : [".js", ...Object.keys(extensions)].map(ext => `tpack.config${ext}`))
	let tasks: any
	try {
		tasks = await loadConfig(configFile || require.resolve("../configs/tpack.config.default.js"), !args["--no-es-module"]) || {}
	} catch (e) {
		console.error(i18n`Cannot load '${configFile}': ${e.stack}`)
		process.exitCode = -8
		return
	}
	if (args["--completion"]) {
		return notImplemented("--completion")
	}
	if (args["--tasks"]) {
		console.info(i18n`Defined tasks in '${configFile || i18n`<default config file>`}':`)
		console.info(formatTaskList(Object.keys(tasks)))
		return
	}
	const taskNames = searchList(tasks, taskName || "default")
	if (taskNames.length !== 1) {
		console.info(i18n`Error: Task '${taskName}' is not defined in '${configFile || i18n`<default config file>`}'`)
		console.info("")
		if (taskNames.length) {
			console.info(i18n`Did you mean one of these?`)
			console.info(formatTaskList(taskNames))
			process.exitCode = -4
		} else {
			console.info(i18n`Defined tasks:`)
			console.info(formatTaskList(Object.keys(tasks)))
			process.exitCode = -5
		}
		return
	}

	// 读取用户配置
	const task = tasks[taskNames[0]]
	const options = typeof task === "function" ? await task(args) : task
	if (options == null || typeof options !== "object" || Object.getPrototypeOf(options) !== Object.prototype) {
		return
	}
	// 覆盖用户配置
	for (const key in args) {
		const commandOption = (commandLineOptions as any)[key]
		if (commandOption && commandOption.apply) {
			commandOption.apply(options, args[key])
		}
	}
	if (configFile) {
		options.baseDir = resolve(dirname(configFile), options.baseDir || ".")
	}

	// 创建构建器，解析配置
	const { Builder } = require("../core/builder") as typeof import("../core/builder")
	let builder: Builder
	try {
		builder = new Builder(options)
	} catch (e) {
		console.error(i18n`Cannot parse config: ${options["--verbose"] ? e.stack : e.message}\n    at ${taskNames[0]} (${configFile})`)
		process.exitCode = -3
		return
	}
	// 执行主逻辑
	try {
		process.exitCode = await builder.run()
	} catch (e) {
		console.error(e.stack || e)
		process.exitCode = -2
	}

	/**
	 * 在当前文件夹及上级文件夹中搜索指定名称的文件
	 * @param names 要搜索的文件名
	 * @returns 如果找到则返回绝对路径，否则返回空
	 */
	function searchFile(names: string[]) {
		let dir = process.cwd()
		while (true) {
			for (const name of names) {
				const fullPath = join(dir, name)
				if (existsSync(fullPath)) {
					return fullPath
				}
			}
			const prevDir = dir
			dir = dirname(dir)
			if (dir.length === prevDir.length) {
				break
			}
		}
		return null
	}

	/** 获取命令行程序的版本号 */
	function version() {
		return JSON.parse(readFileSync(`${__dirname}/../../package.json`, "utf-8")).version as string
	}

	/**
	 * 搜索以指定名称开始的键
	 * @param value 要搜索的键名
	 * @returns 返回所有匹配的键列表
	 */
	function searchList(list: { [key: string]: any }, value: string) {
		if (value in list) {
			return [value]
		}
		const result: string[] = []
		for (const key in list) {
			if (key.startsWith(value)) {
				result.push(key)
			}
		}
		return result
	}

	/** 格式化任务列表 */
	function formatTaskList(tasks: string[]) {
		return tasks.map((task, index) => `${index + 1}) ${task}`).join("\n")
	}

	function notImplemented(name: string) {
		// todo
		console.error(i18n`Option '${name}' is not implemented yet`)
		process.exit(-100)
	}

}