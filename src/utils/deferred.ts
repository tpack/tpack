/** 表示一个延时等待对象，用于同时等待多个异步任务 */
export class Deferred implements PromiseLike<any> {

	/** 所有异步任务完成后的回调函数 */
	private readonly _callbacks: (() => any)[] = []

	/** 获取正在执行的异步任务数 */
	rejectCount = 0

	/** 记录即将执行一个异步任务 */
	reject() {
		this.rejectCount++
	}

	/** 记录一个异步任务已完成 */
	resolve() {
		this.rejectCount--
		while (this.rejectCount === 0) {
			const callback = this._callbacks.shift()
			if (callback) {
				try {
					callback()
				} catch (e) {
					// 在同一个周期内，所有添加的回调函数都会被执行并移除
					// 当其中某一个函数执行报错，不再执行后续函数，但仍然移除它们，以确保当前对象可以被继续使用。
					if (this.rejectCount === 0) {
						this._callbacks.length = 0
					}
					throw e
				}
			} else {
				break
			}
		}
	}

	/**
	 * 添加所有异步任务执行完成后的回调函数
	 * @param callback 要执行的回调函数
	 */
	then(callback: (_?: any) => any) {
		if (this.rejectCount) {
			this._callbacks.push(callback)
		} else {
			callback()
		}
		return this
	}

}