import { AsyncQueue } from "../utils/asyncQueue"
import { Logger, LogLevel } from "../utils/logger"
import { isAbsolutePath } from "../utils/path"
import { exec } from "../utils/process"
import { i18n } from "./i18n"
import { Resolver } from "./resolver"

/** 表示一个包管理器 */
export class PackageManager {

	/**
	 * 用于安装依赖的命令，其中 `<package>` 会被替换为安装的包名
	 * @param name 要解析的包名
	 * @param baseDir 当前的工作目录
	 * @param target 当前的包管理器
	 * @default false
	 */
	readonly installDependency?: string | ((name: string, baseDir: string, target: PackageManager) => boolean | Promise<boolean>)

	/**
	 * 用于安装开发依赖的命令，其中 `<package>` 会被替换为安装的包名
	 * @param name 要解析的包名
	 * @param baseDir 当前的工作目录
	 * @param target 当前的包管理器
	 * @default "npm install <package> --colors --save-dev"
	 * @example "yarn add <package> --dev"
	 */
	readonly installDevDependency?: string | ((name: string, baseDir: string, target: PackageManager) => boolean | Promise<boolean>)

	/** 获取关联的日志记录器 */
	readonly logger: Logger

	/** 获取使用的模块路径解析器 */
	readonly resolver: Resolver

	/**
	 * 初始化新的包管理器
	 * @param installDependency 用于安装依赖的命令，其中 `<package>` 会被替换为安装的包名
	 * @param installDevDependency 用于安装开发依赖的命令，其中 `<package>` 会被替换为安装的包名
	 * @param logger 日志记录器
	 * @param resolver 模块路径解析器
	 */
	constructor(installDependency?: boolean | string | ((name: string, baseDir: string, target: PackageManager) => boolean | Promise<boolean>), installDevDependency?: boolean | string | ((name: string, baseDir: string, target: PackageManager) => boolean | Promise<boolean>), logger = new Logger({ logLevel: LogLevel.silent }), resolver = new Resolver({ type: "node" })) {
		this.installDependency = installDependency === true ? "npm install <package>" : installDependency || undefined
		this.installDevDependency = installDevDependency === undefined || installDevDependency === true ? "npm install <package> --save-dev" : installDevDependency || undefined
		this.logger = logger
		this.resolver = resolver
	}

	/**
	 * 从指定的位置解析一个包的绝对路径，如果解析失败则尝试自动安装，如果找不到包或安装失败则返回空
	 * @param name 要解析的包名
	 * @param baseDir 当前的工作目录
	 * @param devDependency 安装依赖时是否安装为开发依赖
	 */
	async resolve(name: string, baseDir: string, devDependency?: boolean) {
		const resolved = await this.resolver.resolve(name, baseDir)
		if (resolved === null && await this.install(name, baseDir, devDependency)) {
			return await this.resolver.resolve(name, baseDir)
		}
		return resolved
	}

	/** 确保同时只执行一个安装命令 */
	private readonly _installQueue = new AsyncQueue()

	/** 已安装的包，键为要安装的包名，如果包已安装成功则值为 `true`，如果包已安装失败则值为 `false` */
	private readonly _installedPackages = new Map<string, boolean>()

	/**
	 * 安装一个包
	 * @param name 要安装的包名
	 * @param baseDir 当前的工作目录
	 * @param devDependency 安装依赖时是否安装为开发依赖
	 * @returns 如果安装成功则返回 `true`，否则说明模块路径错误或安装命令退出状态码非 0，返回 `false`
	 */
	async install(name: string, baseDir: string, devDependency?: boolean) {
		const installCommand = devDependency ? this.installDevDependency : this.installDependency
		// 禁止安装相对路径或绝对路径
		if (!installCommand || /^[.~/]/.test(name) || isAbsolutePath(name)) {
			return false
		}
		// 将 @tpack/compilers/less 转为 @tpack/compilers
		name = (/^(?:@[^\/]+\/)?[^\/]+/s.exec(name) || [name])[0]
		return await this._installQueue.then(async () => {
			// 不重复安装相同的模块
			const exists = this._installedPackages.get(name)
			if (exists !== undefined) {
				return exists
			}
			let result: boolean
			if (typeof installCommand === "function") {
				const installingTask = this.logger.begin(installCommand.name || this.constructor.name, i18n`Installing package '${name}'`, true)
				try {
					result = await installCommand(name, baseDir, this)
				} finally {
					this.logger.end(installingTask)
				}
			} else {
				const command = installCommand.replace("<package>", name)
				const installingTask = this.logger.begin(command.replace(/\s.*$/s, ""), i18n`Installing package '${name}'`, true)
				try {
					this.logger.debug(`${baseDir}>${command}`)
					const execResult = await exec(command, {
						cwd: baseDir,
						env: {
							...process.env,
							// 避免出现权限问题
							NODE_ENV: null!
						}
					})
					result = execResult.exitCode === 0
					if (result) {
						if (execResult.stderr) {
							this.logger.debug(execResult.stderr)
						}
						if (execResult.stdout) {
							this.logger.debug(execResult.stdout)
						}
					} else {
						this.logger.error({
							message: i18n`Cannot install package '${name}', please run '${command}' manually`,
							detail: `${execResult.stderr || ""}\n${execResult.stdout || ""}`.trim()
						})
					}
				} finally {
					this.logger.end(installingTask)
				}
			}
			// 如果安装成功，需要清除模块解析缓存
			if (result) {
				this.resolver.clearCache()
			}
			this._installedPackages.set(name, result)
			return result
		})
	}

}