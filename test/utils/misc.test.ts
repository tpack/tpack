import * as assert from "assert"
import * as misc from "../../src/utils/misc"

export namespace miscTest {

	export function stripBOMTest() {
		assert.deepStrictEqual(misc.stripBOM("\ufeffg"), "g")

		assert.deepStrictEqual(misc.stripBOM(""), "")
		assert.deepStrictEqual(misc.stripBOM("\ufeff"), "")
	}

	export function randomStringTest() {
		assert.deepStrictEqual(misc.randomString(8).length, 8)
		assert.deepStrictEqual(misc.randomString(100).length, 100)
		assert.deepStrictEqual(misc.randomString(0), "")
	}

	export function insertSortedTest() {
		assert.deepStrictEqual(test([], 1), [1])
		assert.deepStrictEqual(test([0], 1), [0, 1])
		assert.deepStrictEqual(test([2], 1), [1, 2])
		assert.deepStrictEqual(test([1, 3], 2), [1, 2, 3])
		assert.deepStrictEqual(test([1, 3, 5], 2), [1, 2, 3, 5])
		assert.deepStrictEqual(test([1, 3, 5], 3), [1, 3, 3, 5])
		assert.deepStrictEqual(test([1, 3, 5], 5), [1, 3, 5, 5])
		assert.deepStrictEqual(test([{ value: 1 }, { value: 3 }], { value: 1, foo: 1 }, (x, y) => x.value <= y.value), [{ value: 1 }, { value: 1, foo: 1 }, { value: 3 }])

		function test(array: any[], value: any, comparer = (x: any, y: any) => x <= y) {
			misc.insertSorted(array, value, comparer)
			return array
		}
	}

	export async function throttleTest() {
		let value = 0
		await new Promise(resolve => {
			const func = misc.throttle(() => {
				value++
				resolve()
			})
			func()
			func()
		})
		assert.strictEqual(value, 1)

		await new Promise(resolve => {
			const func = misc.throttle(() => {
				value++
				resolve()
			}, 2)
			func()
			func()
		})
		assert.strictEqual(value, 2)
	}

	export function escapeRegExpTest() {
		assert.strictEqual(new RegExp(misc.escapeRegExp("\\s")).source, /\\s/.source)
	}

	export function formatDateTest() {
		assert.strictEqual(misc.formatDate(new Date("2014/01/01 03:05:07"), "yyMdHms"), "1411357")

		assert.strictEqual(misc.formatDate(new Date("2014/01/01 03:05:07"), "yyyy-MM-dd HH:mm:ss"), "2014-01-01 03:05:07")
		assert.strictEqual(misc.formatDate(new Date("2014/01/01 03:05:07"), "yyMMddHHmmss"), "140101030507")
		assert.strictEqual(misc.formatDate(new Date("2014/01/01 03:05:07"), "你好"), "你好")
		assert.strictEqual(misc.formatDate(new Date("2014/01/01 03:05:07"), "abc"), "abc")
	}

	export function formatHRTimeTest() {
		assert.strictEqual(misc.formatHRTime([0, 0]), "<0.01ms")
		assert.strictEqual(misc.formatHRTime([0, 1000]), "<0.01ms")
		assert.strictEqual(misc.formatHRTime([0, 9999]), "<0.01ms")
		assert.strictEqual(misc.formatHRTime([0, 10000]), "0.01ms")
		assert.strictEqual(misc.formatHRTime([0, 20000]), "0.02ms")
		assert.strictEqual(misc.formatHRTime([0, 100000]), "0.1ms")
		assert.strictEqual(misc.formatHRTime([0, 1000000]), "1ms")
		assert.strictEqual(misc.formatHRTime([0, 10000000]), "10ms")
		assert.strictEqual(misc.formatHRTime([0, 100000000]), "100ms")
		assert.strictEqual(misc.formatHRTime([0, 999999999]), "1000ms")
		assert.strictEqual(misc.formatHRTime([1, 0]), "1s")
		assert.strictEqual(misc.formatHRTime([1, 100000000]), "1.1s")
		assert.strictEqual(misc.formatHRTime([1, 110000000]), "1.11s")
		assert.strictEqual(misc.formatHRTime([1, 119000000]), "1.12s")
		assert.strictEqual(misc.formatHRTime([1, 306083663]), "1.31s")
		assert.strictEqual(misc.formatHRTime([1, 999999999]), "2s")
		assert.strictEqual(misc.formatHRTime([10, 0]), "10s")
		assert.strictEqual(misc.formatHRTime([60, 100000000]), "1min")
		assert.strictEqual(misc.formatHRTime([60, 999999999]), "1.02min")
		assert.strictEqual(misc.formatHRTime([120, 100000000]), "2min")
		assert.strictEqual(misc.formatHRTime([150, 100000000]), "2.5min")
		assert.strictEqual(misc.formatHRTime([200, 100000000]), "3.33min")
		assert.strictEqual(misc.formatHRTime([1500, 100000000]), "25min")
		assert.strictEqual(misc.formatHRTime([15000, 100000000]), "250min")
	}

	export function formatSizeTest() {
		assert.strictEqual(misc.formatSize(1000), "0.98KB")

		assert.strictEqual(misc.formatSize(0), "0B")
		assert.strictEqual(misc.formatSize(1), "1B")
		assert.strictEqual(misc.formatSize(1024), "1KB")
		assert.strictEqual(misc.formatSize(1024 * 1024), "1MB")
		assert.strictEqual(misc.formatSize(1024 * 1024 * 1024), "1GB")
		assert.strictEqual(misc.formatSize(1024 * 1024 * 1024 * 1024), "1TB")
	}

}