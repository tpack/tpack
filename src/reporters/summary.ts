import { BuildContext, Builder } from "../core/builder"
import { i18n } from "../core/i18n"
import { ANSIColor, bold, color } from "../utils/ansi"

/**
 * 表示一个概述报告器
 * @param context 构建的上下文
 * @param builder 当前的构建器对象
 */
export default function (context: BuildContext, builder: Builder) {
	const log = i18n`${context.errorCount ? color(context.fullBuild ? i18n`Build completed!` : i18n`Rebuild completed!`, ANSIColor.brightRed) : context.warningCount ? color(context.fullBuild ? i18n`Build completed!` : i18n`Rebuild completed!`, ANSIColor.brightYellow) : color(context.fullBuild ? i18n`Build success!` : i18n`Rebuild success!`, ANSIColor.brightGreen)}${context.fullBuild ? ` → ${bold(builder.logger.formatPath(builder.outDir))}` : ""} (${builder.logger.errorIcon}${color(context.errorCount.toString(), context.errorCount > 0 ? ANSIColor.brightRed : ANSIColor.brightBlack)}  ${builder.logger.warningIcon}${color(context.warningCount.toString(), context.warningCount > 0 ? ANSIColor.brightYellow : ANSIColor.brightBlack)}  ${i18n`Σ `}${context.entryModules.length}  ${i18n`⏱ `}${context.elapsedTime[0] > 60 ? color(context.elapsedTimeString, ANSIColor.brightYellow) : context.elapsedTimeString})`
	if (context.errorCount) {
		builder.logger.fatal(log)
	} else {
		builder.logger.success(log)
	}
}