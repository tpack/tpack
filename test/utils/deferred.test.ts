import * as assert from "assert"
import * as deferred from "../../src/utils/deferred"

export namespace deferredTest {

	export async function deferredTest() {
		const q = new deferred.Deferred()
		await q

		let value = 1
		q.reject()
		q.reject()
		q.resolve()
		setTimeout(() => {
			q.resolve()
			assert.strictEqual(++value, 3)
		}, 1)
		assert.strictEqual(++value, 2)

		await q
		assert.strictEqual(++value, 4)
	}

	export async function errorTest() {
		const q = new deferred.Deferred()
		let value = 1
		q.reject()
		q.then(() => {
			throw "error"
		})
		q.then(() => {
			value++
		})
		assert.throws(() => {
			q.resolve()
		})
		q.reject()
		q.resolve()
		assert.strictEqual(value, 1)
	}

	export async function errorTest2() {
		const q = new deferred.Deferred()
		let value = 1
		q.reject()
		q.then(() => {
			q.reject()
			throw "error"
		})
		q.then(() => {
			value++
		})
		assert.throws(() => {
			q.resolve()
		})
		q.resolve()
		assert.strictEqual(value, 2)
	}

}