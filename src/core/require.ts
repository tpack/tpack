import Module = require("module")
import { AsyncQueue } from "../utils/asyncQueue"
import { throttle } from "../utils/misc"
import { isAbsolutePath } from "../utils/path"
import { exec } from "../utils/process"
import { i18n } from "./i18n"
import { Logger } from "./logger"
import { Resolver } from "./resolver"

/**
 * 从指定的位置解析一个包的绝对路径，如果解析失败则尝试自动安装
 * @param name 要解析的包名
 * @param baseDir 当前的工作目录
 * @param installCommand 用于自动安装的命令，如果为空则不自动安装
 * @param logger 日志记录器
 * @returns 如果解析成功则返回绝对路径，否则将抛出异常
 */
export async function resolve(name: string, baseDir: string, installCommand: string | undefined, logger: Logger) {
	// 尝试从本地解析
	const localRequire = ((Module as any).createRequire || Module.createRequireFromPath)(baseDir + "/_.js") as typeof require
	try {
		return localRequire.resolve(name)
	} catch (e) {
		if (!installCommand || e.code !== "MODULE_NOT_FOUND") {
			throw e
		}
	}
	// 尝试从全局解析
	try {
		return require.resolve(name)
	} catch (e) {
		if (!installCommand || e.code !== "MODULE_NOT_FOUND") {
			throw e
		}
	}
	// 尝试安装依赖
	await installPackage(name, baseDir, installCommand, logger)
	// 尝试重新解析
	// 原生的 require 和 Module.createRequireFromPath 有缓存问题，无法使用：
	// 如果 node_modules 在一开始不存在，则之后即使创建了 node_modules，里面的模块也会被忽略
	const resolver = new Resolver({
		extensions: ["", ".js", ".json", ".node"],
		mainFields: ["main"],
		aliasFields: []
	})
	return await resolver.resolve(name, baseDir) || localRequire.resolve(name)
}

/** 确保同时只执行一个安装命令 */
const installQueue = new AsyncQueue()

/** 正在安装的包列表 */
const installingPackages = new Map<string, boolean>()

/** 重新安装的回调函数 */
const clearInstallingPackages = throttle(() => {
	installingPackages.clear()
}, 2000)

/**
 * 安装一个包
 * @param name 要安装的包名
 * @param baseDir 当前的工作目录
 * @param installCommand 用于安装的命令
 * @param logger 日志记录器
 * @returns 如果安装成功则返回 `true`，否则说明模块路径错误或安装命令退出状态码非 0，返回 `false`
 */
export async function installPackage(name: string, baseDir: string, installCommand: string, logger: Logger) {
	// 禁止安装相对路径或绝对路径
	if (/^[./~]/.test(name) || isAbsolutePath(name)) {
		return false
	}
	if (name.indexOf("/") >= 0) {
		if (name.startsWith("@")) {
			name = name.replace(/^([^/]*\/[^/]*)\/.*$/s, "$1")
		} else {
			name = name.replace(/\/.*$/s, "")
		}
		// // 当用户请求 foo/goo 时，foo 更可能是本地的全局模块，而非来自 NPM
		// if (!name.startsWith("@")) {
		// 	return false
		// }
		// // @foo/goo 更像是 NPM 上的包
		// name = name.replace(/^([^/]*\/[^/]*)\/.*$/s, "$1")
	}
	// 同时只能开启一个安装进程
	try {
		return await installQueue.then(async () => {
			// 同名模块不重复安装
			const exists = installingPackages.get(name)
			if (exists !== undefined) {
				return exists
			}
			// 安装模块
			const command = installCommand.replace("<package>", name)
			const installingTask = logger.begin(command.replace(/\s.*$/s, ""), i18n`Installing package '${name}'`, true)
			try {
				logger.debug(`${baseDir}>${command}`)
				const result = await exec(command, {
					cwd: baseDir,
					env: {
						...process.env,
						// 避免出现权限问题
						NODE_ENV: null!
					}
				})
				const success = result.exitCode === 0
				installingPackages.set(name, success)
				if (success) {
					logger.debug(`${result.stderr || ""}\n${result.stdout || ""}`.trim())
				} else {
					logger.error({
						message: i18n`Cannot install package '${name}', try to run '${command}' manually and retry`,
						detail: `${result.stderr || ""}\n${result.stdout || ""}`.trim()
					})
				}
				return success
			} finally {
				logger.end(installingTask)
			}
		})
	} finally {
		// 如果已安装当前期间所有模块，则下次可继续安装同名模块
		if (installQueue.isEmpty) {
			clearInstallingPackages()
		}
	}
}