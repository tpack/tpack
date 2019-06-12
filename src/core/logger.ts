import { ANSIColor, bold, color, formatCodeFrame, removeANSICodes, truncateString } from "../utils/ansi"
import { clear, hideCursor, showCursor } from "../utils/commandLine"
import { formatDate } from "../utils/misc"
import { relativePath, resolvePath } from "../utils/path"
import { i18n } from "./i18n"

/** 表示一个日志记录器 */
export class Logger {

	// #region 选项

	/**
	 * 初始化新的日志输出器
	 * @param options 附加选项
	 */
	constructor(options: LoggerOptions = {}) {
		// @ts-ignore
		this.logLevel = options.logLevel !== undefined ? typeof options.logLevel === "string" ? LogLevel[options.logLevel] : options.logLevel : LogLevel.log
		this.ignore = options.ignore instanceof RegExp ? log => (options.ignore as RegExp).test(typeof log === "string" ? log : log instanceof Error ? log.message : String(log)) : options.ignore
		this.colors = options.colors !== undefined ? options.colors : process.stdout.isTTY === true && !process.env["NODE_DISABLE_COLORS"]
		this.fullPath = !!options.fullPath
		this.baseDir = options.baseDir || process.cwd()
		this.codeFrame = options.codeFrame !== false
		this.codeFrameOptions = { lineNumbers: true, columnNumbers: true, tab: "    ", maxWidth: process.stdout.columns, maxHeight: 5, ...(typeof options.codeFrame === "object" ? options.codeFrame : undefined) }
		this.persistent = options.persistent !== undefined ? options.persistent : !this.colors
		this.progress = options.progress !== undefined ? options.progress : this.colors
		this.spinnerFrames = options.spinnerFrames || (process.platform === "win32" && /^\d\./.test(require("os").release()) ? ["-", "\\", "|", "/"] : ["⠋ ", "⠙ ", "⠹ ", "⠸ ", "⠼ ", "⠴ ", "⠦ ", "⠧ ", "⠇ ", "⠏ "])
		this.spinnerInterval = options.spinnerInterval || 90
		this.hideCursor = options.hideCursor !== false
		this.successIcon = options.successIcon !== undefined ? options.successIcon : process.platform === "win32" ? i18n`✔ ` : i18n`√ `
		this.warningIcon = options.warningIcon !== undefined ? options.warningIcon : process.platform === "win32" ? i18n`⚠ ` : `⚠️ `
		this.errorIcon = options.errorIcon !== undefined ? options.errorIcon : process.platform === "win32" ? i18n`✘ ` : i18n`× `
		this.fatalIcon = options.fatalIcon !== undefined ? options.fatalIcon : this.errorIcon
	}

	// #endregion

	// #region 日志

	/**
	 * 记录一条调试日志
	 * @param log 要记录的日志或错误对象
	 * @param persistent 是否在清屏时保留此日志
	 */
	debug(log: string | Error | LogEntry, persistent?: boolean) {
		return this.write(log, LogLevel.debug, persistent)
	}

	/**
	 * 记录一条普通日志
	 * @param log 要记录的日志或错误对象
	 * @param persistent 是否在清屏时保留此日志
	 */
	log(log: string | Error | LogEntry, persistent?: boolean) {
		return this.write(log, LogLevel.log, persistent)
	}

	/**
	 * 记录一条信息日志
	 * @param log 要记录的日志或错误对象
	 * @param persistent 是否在清屏时保留此日志
	 */
	info(log: string | Error | LogEntry, persistent?: boolean) {
		return this.write(log, LogLevel.info, persistent)
	}

	/**
	 * 记录一条成功日志
	 * @param log 要记录的日志或错误对象
	 * @param persistent 是否在清屏时保留此日志
	 */
	success(log: string | Error | LogEntry, persistent?: boolean) {
		return this.write(log, LogLevel.success, persistent)
	}

	/**
	 * 记录一条警告日志
	 * @param log 要记录的日志或错误对象
	 * @param persistent 是否在清屏时保留此日志
	 */
	warning(log: string | Error | LogEntry, persistent?: boolean) {
		return this.write(log, LogLevel.warning, persistent)
	}

	/**
	 * 记录一条错误日志
	 * @param log 要记录的日志或错误对象
	 * @param persistent 是否在清屏时保留此日志
	 */
	error(log: string | Error | LogEntry, persistent?: boolean) {
		return this.write(log, LogLevel.error, persistent)
	}

	/**
	 * 记录一条致命错误日志
	 * @param log 要记录的日志或错误对象
	 * @param persistent 是否在清屏时保留此日志
	 */
	fatal(log: string | Error | LogEntry, persistent?: boolean) {
		return this.write(log, LogLevel.fatal, persistent)
	}

	/** 获取或设置允许打印的最低日志等级 */
	logLevel: LogLevel

	/**
	 * 判断是否忽略指定日志的回调函数
	 * @param log 要记录的日志或错误对象
	 * @param logLevel 日志等级
	 * @param persistent 是否在清屏时保留此日志
	 */
	ignore?: (log: string | Error | LogEntry, logLevel: LogLevel, persistent?: boolean) => boolean

	/** 获取或设置当前错误或警告的编号 */
	errorOrWarningCounter = 0

	/** 在成功日志前追加的前缀 */
	successIcon: string

	/** 在警告日志前追加的前缀 */
	warningIcon: string

	/** 在错误日志前追加的前缀 */
	errorIcon: string

	/** 在致命错误日志前追加的前缀 */
	fatalIcon: string

	/**
	 * 底层实现打印一条日志
	 * @param log 要格式化的日志或错误对象或错误信息
	 * @param level 日志的等级
	 * @param persistent 是否在清屏时保留此日志
	 */
	write(log: string | Error | LogEntry, level: LogLevel, persistent?: boolean) {
		if (level < this.logLevel || this.ignore && this.ignore(log, level, persistent)) {
			return
		}
		const content = this.formatLog(log, level)
		if (persistent) {
			this._persistentLog = this._persistentLog != undefined ? `${this._persistentLog}\n${content}` : content
		}
		switch (level) {
			case LogLevel.error:
			case LogLevel.fatal:
				return console.error(content)
			case LogLevel.warning:
				return console.warn(content)
			case LogLevel.info:
			case LogLevel.success:
				return console.info(content)
			case LogLevel.debug:
				return console.debug(content)
			default:
				return console.log(content)
		}
	}

	/** 判断或设置是否打印带颜色 ANSI 控制符的日志 */
	colors: boolean

	/** 判断或设置是否打印代码片段 */
	codeFrame: boolean

	/** 获取或设置代码片段的选项 */
	codeFrameOptions: Exclude<LoggerOptions["codeFrame"], boolean | undefined>

	/**
	 * 格式化一条日志
	 * @param log 要格式化的日志或错误对象或错误信息
	 * @param level 日志的等级
	 * @param colors 是否追加颜色控制符
	 */
	formatLog(log: string | Error | LogEntry, level = LogLevel.log, colors = this.colors) {
		let content: string
		if (typeof log === "string") {
			content = log
		} else if (log instanceof Error) {
			content = `${color(`[${log.name}]`, ANSIColor.brightRed)}${log.message}`
			const stack = this.formatStack(log.stack || "")
			if (stack) {
				content += `\n${color(stack, ANSIColor.brightBlack)}`
			}
		} else {
			content = ""
			// 添加路径
			if (log.fileName) {
				content += bold(this.formatPath(log.fileName))
				if (log.line != undefined) {
					let loc = `(${log.line + 1}`
					if (log.column != undefined) {
						loc += `,${log.column + 1}`
					}
					if (!this.colors && log.endLine != undefined) {
						loc += `-${log.endLine + 1}`
						if (log.endColumn != undefined) {
							loc += `,${log.endColumn + 1}`
						}
					}
					loc += ")"
					content += color(loc, ANSIColor.brightBlack)
				}
				if (log.message != undefined || log.source || log.error != undefined) {
					content += color(": ", ANSIColor.brightBlack)
				}
			}
			// 添加名字
			if (log.source) {
				content += color(`[${log.source}]`, ANSIColor.brightCyan)
			}
			// 添加信息
			if (log.message != undefined) {
				content += log.message
			} else if (log.error != undefined) {
				if (log.error.name) {
					content += color(`[${log.error.name}]`, ANSIColor.brightRed)
				}
				content += log.error.message || log.error.toString()
			}
			// 添加详情
			if (log.detail) {
				content += `\n${color(log.detail, ANSIColor.brightBlack)}`
			}
			// 添加源代码片段
			if (this.codeFrame) {
				let codeFrame = log.codeFrame
				if (codeFrame == undefined && log.content && log.line !== undefined) {
					codeFrame = formatCodeFrame(log.content, log.line, log.column, log.endLine, log.endColumn, this.codeFrameOptions.lineNumbers, this.codeFrameOptions.columnNumbers, this.codeFrameOptions.tab, this.codeFrameOptions.maxHeight, this.codeFrameOptions.maxWidth)
				}
				if (codeFrame) {
					content += `\n\n${color(codeFrame, ANSIColor.brightBlack)}\n`
				}
			}
			// 添加堆栈信息
			const stack = log.error && (log.showStack || this.logLevel === LogLevel.debug) && this.formatStack(log.error.stack || "")
			if (stack) {
				content += `\n\n${color(stack, ANSIColor.brightBlack)}\n`
			}
		}
		// 添加前缀
		switch (level) {
			case LogLevel.error:
				content = `${color(`${++this.errorOrWarningCounter}) ${this.errorIcon}`, ANSIColor.brightRed)}${content}`
				break
			case LogLevel.warning:
				content = `${color(`${++this.errorOrWarningCounter}) ${this.warningIcon}`, ANSIColor.brightYellow)}${content}`
				break
			case LogLevel.info:
			case LogLevel.debug:
				content = `${color(formatDate(new Date(), "[HH:mm:ss]"), ANSIColor.brightBlack)} ${content}`
				break
			case LogLevel.fatal:
				content = `${color(formatDate(new Date(), "[HH:mm:ss]"), ANSIColor.brightBlack)} ${color(this.fatalIcon, ANSIColor.brightRed)}${content}`
				break
			case LogLevel.success:
				content = `${color(formatDate(new Date(), "[HH:mm:ss]"), ANSIColor.brightBlack)} ${color(this.successIcon, ANSIColor.brightGreen)}${content}`
				break
		}
		// 去除颜色信息
		if (!colors) {
			content = removeANSICodes(content)
		}
		return content
	}

	/**
	 * 格式化指定的错误堆栈信息
	 * @param stack 要格式化的错误堆栈信息
	 */
	formatStack(stack: string) {
		return stack.split("\n").filter(line => line.startsWith("    at ") && !/\((?:(?:(?:node|(?:internal\/[\w/]*)?\w+|.*?[\\/]node_modules[\\/].*?[\\/]v8-compile-cache|ts-node)\.js:\d+:\d+)|native)\)$/.test(line)).join("\n")
	}

	/** 判断或设置是否打印完整绝对路径 */
	fullPath: boolean

	/** 获取或设置路径的基路径 */
	baseDir: string

	/**
	 * 格式化指定的路径
	 * @param path 要格式化的路径
	 */
	formatPath(path: string) {
		if (!this.fullPath) {
			// 为避免显示 ../，外部路径仍然显示绝对路径
			const relative = relativePath(this.baseDir, path)
			if (relative && !relative.startsWith("../")) {
				return relative
			}
		}
		return resolvePath(path)
	}

	/** 判断或设置是否禁止清除日志 */
	persistent: boolean

	/** 已保留的固定日志 */
	private _persistentLog?: string

	/**
	 * 清除控制台中的所有日志
	 * @param all 是否清除所有日志
	 */
	clear(all?: boolean) {
		this.errorOrWarningCounter = 0
		if (all) {
			delete this._persistentLog
		}
		if (this.persistent || this.logLevel === LogLevel.silent) {
			return
		}
		clear()
		if (this._persistentLog) {
			console.info(this._persistentLog)
		}
		if (this._spinnerTimer) {
			this._updateProgress()
		}
	}

	// #endregion

	// #region 进度

	/** 获取或设置是否打印进度条 */
	progress: boolean

	/** 最后一个任务 */
	private _lastTask?: {
		/** 上一条任务 */
		prev?: Logger["_lastTask"]
		/** 下一条任务 */
		next?: Logger["_lastTask"]
		/** 当前任务关联的日志 */
		content: string
	}

	/** 优先提示的任务 */
	private _persistentTasks?: Logger["_lastTask"][]

	/**
	 * 记录将开始执行指定的任务
	 * @param taskName 要执行的任务名
	 * @param detail 要执行的任务详情
	 * @param persistent 在任务未完成前是否持续提示此任务
	 * @returns 返回任务编号
	 */
	begin(taskName: string, detail?: string, persistent?: boolean) {
		const content = `${color(taskName, ANSIColor.brightCyan)}${detail ? " " + detail : ""}`
		const taskId: Logger["_lastTask"] = { content }
		if (this.logLevel === LogLevel.debug) {
			this.debug(`${color(i18n`Starting`, ANSIColor.brightMagenta)} ${content}`)
		} else {
			if (!this._persistentTasks || !this._persistentTasks.length) {
				this.progressText(content)
			}
			if (persistent) {
				if (this._persistentTasks) {
					this._persistentTasks.push(taskId)
				} else {
					this._persistentTasks = [taskId]
				}
			}
		}
		if (this._lastTask) {
			this._lastTask.next = taskId
			taskId.prev = this._lastTask
		}
		return this._lastTask = taskId
	}

	/**
	 * 记录指定的任务已结束
	 * @param taskId 要结束的任务编号
	 */
	end(taskId: ReturnType<Logger["begin"]>) {
		if (!taskId) {
			return
		}
		if (this.logLevel === LogLevel.debug) {
			this.debug(`${color(i18n`Finished`, ANSIColor.brightBlue)} ${taskId.content}`)
		} else if (this._persistentTasks && this._persistentTasks.length) {
			const index = this._persistentTasks.indexOf(taskId)
			if (index >= 0) {
				this._persistentTasks.splice(index, 1)
				if (index === 0 && this._persistentTasks.length) {
					this.progressText(this._persistentTasks[0]!.content)
				}
			}
		}
		const prev = taskId.prev
		const next = taskId.next
		if (prev) {
			prev.next = next
		}
		if (next) {
			next.prev = prev
		} else {
			this._lastTask = prev
			if (prev) {
				if (this.logLevel !== LogLevel.debug && (!this._persistentTasks || !this._persistentTasks.length)) {
					this.progressText(prev.content)
				}
			} else {
				this.hideProgress()
			}
		}
		// 防止用户重复关闭任务
		taskId.next = taskId.prev = taskId
	}

	/**
	 * 重置日志记录器
	 */
	reset() {
		this.hideProgress()
		this.errorOrWarningCounter = 0
		this._lastTask = undefined
		this._progressPercent = this._progressText = ""
	}

	/** 当前的进度百分比 */
	private _progressPercent = ""

	/**
	 * 设置当前的进度百分比
	 * @param value 要设置的进度值（0 到 100 之间）
	 */
	progressPercent(value: number) {
		if (!this.progress) {
			return
		}
		this._progressPercent = bold(`${value < 10 ? " " + value.toFixed(0) : value.toFixed(0)}%`)
		if (value < 100) {
			this.showProgress()
		} else {
			this.hideProgress()
		}
	}

	/** 当前进度条的文案 */
	private _progressText = ""

	/**
	 * 设置当前的进度条文案
	 * @param value 要设置的进度条文案
	 */
	progressText(value: string) {
		if (!this.progress) {
			return
		}
		// 减去进度指示器和百分比宽度
		this._progressText = truncateString(value, undefined, (process.stdout.columns || Infinity) - this.spinnerFrames[0].length - 4)
		this.showProgress()
	}

	/** 存储进度指示器的计时器 */
	private _spinnerTimer?: ReturnType<typeof setInterval>

	/** 原输出流写入函数 */
	private _oldStdoutWrite?: typeof process.stdout.write

	/** 原错误流写入函数 */
	private _oldStderrWrite?: typeof process.stderr.write

	/** 获取或设置进度指示器更新的间隔毫秒数 */
	spinnerInterval: number

	/** 判断是否需要隐藏光标 */
	hideCursor: boolean

	/** 显示进度条 */
	showProgress() {
		const updateProgressBar = this._updateProgress
		if (!this._spinnerTimer) {
			if (this.hideCursor) hideCursor()
			// 劫持 process.stdout.write，如果发现有新内容输出则先删除进度条，避免只显示部分进度条
			const oldStdoutWrite: Function = this._oldStdoutWrite = process.stdout.write
			process.stdout.write = function () {
				oldStdoutWrite.call(this, "\x1b[0J")
				const result = oldStdoutWrite.apply(this, arguments)
				updateProgressBar()
				return result
			}
			const oldStderrWrite: Function = this._oldStderrWrite = process.stderr.write
			process.stderr.write = function () {
				oldStderrWrite.call(this, "\x1b[0J")
				const result = oldStderrWrite.apply(this, arguments)
				updateProgressBar()
				return result
			}
			this._spinnerTimer = setInterval(updateProgressBar, this.spinnerInterval)
		}
		updateProgressBar()
	}

	/** 获取或设置进度指示器的所有桢 */
	spinnerFrames: string[]

	/** 上一次更新进度条的时间戳 */
	private _spinnerTime = 0

	/** 存储进度指示器的当前桢号 */
	private _spinnerFrameIndex = -1

	/** 更新进度条 */
	private _updateProgress = () => {
		// 更新进度图标
		const now = Date.now()
		if (now - this._spinnerTime >= this.spinnerInterval) {
			this._spinnerTime = now
			if (++this._spinnerFrameIndex === this.spinnerFrames.length) {
				this._spinnerFrameIndex = 0
			}
		}
		this._oldStdoutWrite!.call(process.stdout, `\x1b[0J\x1b[${ANSIColor.brightCyan}m${this.spinnerFrames[this._spinnerFrameIndex]}\x1b[39m${this._progressPercent} ${this._progressText}\x1b[1G`)
	}

	/** 隐藏进度条 */
	hideProgress() {
		// 如果进度条未显示则忽略
		if (!this._spinnerTimer) {
			return
		}
		clearInterval(this._spinnerTimer)
		// 还原劫持的 process.stdout.write
		process.stdout.write = this._oldStdoutWrite!
		process.stderr.write = this._oldStderrWrite!
		this._oldStderrWrite = this._oldStdoutWrite = this._spinnerTimer = undefined
		process.stdout.write("\x1b[0J")
		if (this.hideCursor) showCursor()
	}

	// #endregion

}

/** 表示日志记录器的选项 */
export interface LoggerOptions {
	/**
	 * 允许打印的最低日志等级
	 * @default "log"
	 */
	logLevel?: LogLevel | keyof typeof LogLevel
	/**
	 * 判断是否忽略指定日志的正则表达式或回调函数
	 * @param log 要记录的日志或错误对象
	 * @param logLevel 日志等级
	 * @param persistent 是否在清屏时保留此日志
	 */
	ignore?: RegExp | ((log: string | Error | LogEntry, logLevel: LogLevel, persistent?: boolean) => boolean)
	/**
	 * 是否打印带颜色控制符的日志
	 * @default process.stdout.isTTY && !process.env["NODE_DISABLE_COLORS"]
	 */
	colors?: boolean
	/**
	 * 是否打印完整绝对路径
	 * @default false
	 */
	fullPath?: boolean
	/**
	 * 打印相对路径时使用的基路径
	 * @default process.cwd()
	 */
	baseDir?: string
	/**
	 * 是否打印代码片段
	 */
	codeFrame?: boolean | {
		/**
		 * 是否打印行号
		 * @default true
		 */
		lineNumbers?: boolean
		/**
		 * 是否打印列指示器
		 * @default true
		 */
		columnNumbers?: boolean
		/**
		 * 用于代替制表符的字符串
		 * @description 如果源码使用制表符缩进，设置为 "  " 可以将缩进宽度设为 2
		 * @default "    "
		 */
		tab?: string
		/**
		 * 允许布局的最大宽度（一般地，西文字母宽度为 1，中文文字宽度为 2）
		 * @default process.stdout.columns || Infinity
		 */
		maxWidth?: number
		/**
		 * 允许布局的最大高度
		 * @default 5
		 */
		maxHeight?: number
	}
	/**
	 * 是否禁止清屏
	 * @default !this.colors
	 */
	persistent?: boolean
	/**
	 * 是否打印进度条
	 * @default this.colors
	 */
	progress?: boolean
	/**
	 * 进度指示器的所有桢
	 * @default ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
	 */
	spinnerFrames?: string[]
	/**
	 * 进度指示器自动切换桢的毫秒数
	 * @default 90
	 */
	spinnerInterval?: number
	/**
	 * 是否需要隐藏控制台光标
	 * @default true
	 */
	hideCursor?: boolean
	/**
	 * 在成功日志前追加的前缀
	 * @default this.colors ? process.platform === "win32" ? "✔ " : "√ " : "info: "
	 */
	successIcon?: string
	/**
	 * 在警告日志前追加的前缀
	 * @default this.colors ? process.platform === "win32" ? "⚠ " : "⚠️ " : "warning: "
	 */
	warningIcon?: string
	/**
	 * 在错误日志前追加的前缀
	 * @default this.colors ? process.platform === "win32" ? "✘ " : "× " : "error: "
	 */
	errorIcon?: string
	/**
	 * 在致命错误日志前追加的前缀
	 * @default options.fatalIcon !== undefined ? options.fatalIcon : this.colors ? this.errorIcon : "fatal error: "
	 */
	fatalIcon?: string
}

/** 表示日志的等级 */
export const enum LogLevel {
	/** 调试信息 */
	debug,
	/** 普通日志 */
	log,
	/** 重要信息 */
	info,
	/** 成功信息 */
	success,
	/** 警告 */
	warning,
	/** 错误 */
	error,
	/** 致命错误 */
	fatal,
	/** 无日志 */
	silent
}

/** 表示一条日志项 */
export interface LogEntry {
	[key: string]: any
	/** 日志的来源 */
	source?: string
	/** 日志的信息 */
	message?: string
	/** 原始错误对象 */
	error?: Error
	/** 是否打印错误堆栈信息 */
	showStack?: boolean
	/** 日志相关的源文件名 */
	fileName?: string
	/** 日志相关的源内容 */
	content?: string
	/** 日志相关的源行号（从 0 开始）*/
	line?: number
	/** 日志相关的源列号（从 0 开始）*/
	column?: number
	/** 日志相关的源结束行号（从 0 开始）*/
	endLine?: number
	/** 日志相关的源结束列号（从 0 开始）*/
	endColumn?: number
	/** 日志的详情 */
	detail?: string
	/** 日志相关的源代码片段 */
	codeFrame?: string
}