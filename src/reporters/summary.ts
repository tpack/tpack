import { BuildContext, Builder } from "../core/builder"
import { i18n } from "../core/i18n"
import { ANSIColor, bold, color } from "../utils/ansi"

/**
 * 表示一个概述报告器
 * @param context 构建的上下文
 * @param builder 当前的构建器对象
 */
export default function (context: BuildContext, builder: Builder) {
	const outDir = context.fullBuild ? ` → ${bold(builder.logger.formatPath(builder.outDir))}` : ""
	const errorCount = colorIf(`${builder.logger.errorIcon}${context.errorCount}`, context.errorCount, ANSIColor.brightRed)
	const warningCount = colorIf(`${builder.logger.warningIcon}${context.warningCount}`, context.warningCount, ANSIColor.brightYellow)
	const entryModuleCount = colorIf(`Σ ${context.entryModules.length}`, !context.entryModules.length, ANSIColor.brightYellow)
	const elapsed = `${builder.logger.emoji ? "⏱" : "T"} ${context.elapsedTimeString}`
	const stat = `${outDir} (${errorCount}  ${warningCount}  ${entryModuleCount}  ${elapsed})`
	if (context.errorCount) {
		builder.logger.fatal(`${color(context.fullBuild ? i18n`Build completed!` : i18n`Rebuild completed!`, ANSIColor.brightRed)}${stat}`)
	} else if (context.warningCount) {
		builder.logger.success({
			icon: color(builder.logger.warningIcon, ANSIColor.brightYellow),
			message: `${color(context.fullBuild ? i18n`Build completed!` : i18n`Rebuild completed!`, ANSIColor.brightYellow)}${stat}`
		})
	} else {
		builder.logger.success(`${color(context.fullBuild ? i18n`Build success!` : i18n`Rebuild success!`, ANSIColor.brightGreen)}${stat}`)
	}
	function colorIf(value: string, condition: any, code: ANSIColor) {
		return condition ? color(value, code) : value
	}
}