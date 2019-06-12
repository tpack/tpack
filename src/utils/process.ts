import { ChildProcess, spawn, SpawnOptions } from "child_process"

/**
 * 执行一个命令
 * @param command 要执行的命令
 * @param options 附加选项
 * @returns 返回命令的执行结果，包含退出码和标准流输出等信息
 */
export function exec(command: string, options: SpawnOptions & { args?: readonly string[] } = {}) {
	return new Promise<ExecResult>((resolve, reject) => {
		if (options.shell === undefined) {
			options.shell = true
		}
		const cp = spawn(command, options.args || [], options)
		const result = { process: cp } as ExecResult
		if (cp.stdout) {
			result.stdout = ""
			cp.stdout.setEncoding("utf8").on("data", d => {
				result.stdout! += d
			})
		}
		if (cp.stderr) {
			result.stderr = ""
			cp.stderr.setEncoding("utf8").on("data", d => {
				result.stderr! += d
			})
		}
		cp.on("error", reject)
		cp.on("close", code => {
			result.exitCode = code
			return resolve(result)
		})
	})
}

/** 表示执行命令的结果 */
export interface ExecResult {
	/** 获取执行命令的子进程 */
	process: ChildProcess
	/** 获取命令的退出码 */
	exitCode: number
	/** 获取命令的标准流输出 */
	stdout?: string
	/** 获取命令的错误流输出 */
	stderr?: string
}

/**
 * 在浏览器打开指定的地址
 * @param url 要打开的地址
 * @param wait 是否等待浏览器启动后再返回
 * @param app 使用的浏览器程序，默认由操作系统决定
 * @param appArgs 浏览器程序的附加启动参数
 */
export function open(url: string, wait = false, app?: string, appArgs?: readonly string[]) {
	let cmd: string
	const args: string[] = []
	let options: SpawnOptions | undefined
	if (process.platform === "win32") {
		cmd = "cmd"
		args.push("/c", "start", '""', "/b")
		url = url.replace(/&/g, "^&")
		if (wait) args.push("/wait")
		if (app) args.push(app)
		if (appArgs) args.push(...appArgs)
		args.push(url)
	} else if (process.platform === "darwin") {
		cmd = "open"
		if (wait) args.push("-W")
		if (app) args.push("-a", app)
		args.push(url)
		if (appArgs) args.push("--args", ...appArgs)
	} else {
		cmd = app || "xdg-open"
		if (appArgs) args.push(...appArgs)
		if (!wait) {
			options = {
				stdio: "ignore",
				detached: true
			}
		}
		args.push(url)
	}

	const cp = spawn(cmd, args, options!)
	if (wait) {
		return new Promise((resolve, reject) => {
			cp.on("error", reject)
			cp.on("close", code => {
				if (code > 0) {
					reject(new Error(`The 'open' command exited with code ${code}`))
				} else {
					resolve(cp)
				}
			})
		})
	}
	cp.unref()
	return Promise.resolve(cp)
}

/**
 * 添加当前程序即将退出的回调函数
 * @param callback 要执行的回调函数，不支持异步函数
 */
export function onExit(callback: (reason: "exit" | (ReturnType<typeof signals> extends IterableIterator<infer T> ? T : never), code: number) => void) {
	process.once("__exit__" as any, callback)
	if (process.listenerCount("__exit__") > 1) {
		return
	}
	for (const signal of signals()) {
		try {
			process.once(signal, signalHandler as any)
		} catch { }
	}
	process.once("exit", exitHandler)
}

/**
 * 删除当前程序即将退出的回调函数
 * @param callback 要执行的回调函数
 */
export function offExit(callback: Parameters<typeof onExit>[0]) {
	if (process.listenerCount("__exit__") === 0) {
		return
	}
	process.off("__exit__" as any, callback)
	if (process.listenerCount("__exit__")) {
		return
	}
	for (const signal of signals()) {
		try {
			process.off(signal, signalHandler as any)
		} catch { }
	}
	process.off("exit", exitHandler)
}

/** 当前进程即将退出的回调 */
function exitHandler(code: number) {
	process.emit("__exit__" as any, "exit", code)
}

/** 当前进程被终止的回调 */
function signalHandler(signal: NodeJS.Signals, code: number) {
	process.emit("__exit__" as any, signal, code)
	if (process.listenerCount(signal) === 0) {
		process.kill(process.pid, signal)
	}
}

/**
 * 获取所有退出信号名
 * @see https://github.com/tapjs/signal-exit/blob/master/signals.js
 */
function* signals() {
	yield "SIGABRT"
	yield "SIGALRM"
	yield "SIGHUP"
	yield "SIGINT"
	yield "SIGTERM"
	if (process.platform !== "win32") {
		yield "SIGVTALRM"
		yield "SIGXCPU"
		yield "SIGXFSZ"
		yield "SIGUSR2"
		yield "SIGTRAP"
		yield "SIGSYS"
		yield "SIGQUIT"
		yield "SIGIOT"
	}
	if (process.platform === "linux") {
		yield "SIGIO"
		yield "SIGPOLL"
		yield "SIGPWR"
		yield "SIGSTKFLT"
		yield "SIGUNUSED"
	}
}