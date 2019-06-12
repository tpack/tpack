import { Builder } from "../core/builder"
import { Processor } from "../core/options"
import { VFile } from "../core/vfile"

/** 表示一个编辑器基类 */
export abstract class Compiler implements Processor {

	/** 获取输出的扩展名 */
	outExt?: string

	/** 当前的插件实例 */
	private _vendor: any

	/** 获取实际使用的插件 */
	abstract get vendorName(): string

	async process(file: VFile, options: any, builder: Builder) {
		// 更新扩展名
		const outExt = this.outExt
		if (outExt != undefined) {
			file.ext = outExt
		}
		// 忽略空文件
		if (file.noData) {
			return
		}
		// 安装插件
		let vendor = this._vendor
		if (vendor === undefined) {
			vendor = await builder.require(this.vendorName)
			if (this.init) {
				await this.init(vendor, options, builder)
			}
		}
		// 编译
		return await this.compile(file, options, vendor, builder)
	}

	/**
	 * 初始化插件
	 * @param vendor 已载入的插件实例
	 * @param options 用户提供的附加选项
	 * @param builder 当前的构建器对象
	 */
	init?(vendor: any, options: any, builder: Builder): void

	/**
	 * 当被子类重写时负责编译指定的代码
	 * @param file 要处理的文件
	 * @param options 用户的选项
	 * @param vendor 已载入的插件实例
	 * @param builder 当前的构建器对象
	 */
	abstract compile(file: VFile, options: any, vendor: any, builder: Builder): Promise<void> | void

}