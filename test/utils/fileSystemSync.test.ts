import * as assert from "assert"
import * as fs from "fs"
import * as path from "path"
import * as fileSystemSync from "../../src/utils/fileSystemSync"
import { init, rootDir, simulateIOError, uninit } from "../helpers/fsHelper"

export namespace fileSystemSyncTest {

	export async function beforeEach() {
		await init({
			"dir1": {
				"sub1": {
					"f3.txt": "f3.txt",
					"f4.txt": "f4.txt"
				},
				"sub2": {
					"f5.txt": "f5.txt"
				}
			},
			"dir2": {},
			"f1.txt": "f1.txt",
			"f2.txt": "f2.txt"
		})
	}

	export async function afterEach() {
		await uninit()
	}

	export function getStatTest() {
		assert.strictEqual(fileSystemSync.getStat("dir1").isDirectory(), true)
		assert.strictEqual(fileSystemSync.getStat("f1.txt").isFile(), true)

		assert.strictEqual(fileSystemSync.getStat("dir1", false).isDirectory(), true)
		assert.strictEqual(fileSystemSync.getStat("f1.txt", false).isFile(), true)

		assert.throws(() => { fileSystemSync.getStat("404") })
	}

	export function existsFileTest() {
		assert.strictEqual(fileSystemSync.existsFile("f1.txt"), true)
		assert.strictEqual(fileSystemSync.existsFile("dir1"), false)

		assert.strictEqual(fileSystemSync.existsFile("404"), false)
	}

	export function existsDirTest() {
		assert.strictEqual(fileSystemSync.existsDir("f1.txt"), false)
		assert.strictEqual(fileSystemSync.existsDir("dir1"), true)

		assert.strictEqual(fileSystemSync.existsDir("404"), false)
	}

	export function ensureNotExistsTest() {
		assert.strictEqual(fileSystemSync.ensureNotExists("dir1"), "dir1_2")
		assert.strictEqual(fileSystemSync.ensureNotExists("f1.txt"), "f1_2.txt")
		assert.strictEqual(fileSystemSync.ensureNotExists("404"), "404")

		fs.writeFileSync("f1_99.txt", "f1_99.txt")
		assert.strictEqual(fileSystemSync.ensureNotExists("f1_99.txt"), "f1_100.txt")

		assert.strictEqual(fileSystemSync.ensureNotExists("f1.txt", "(0)"), "f1(0).txt")

		fs.writeFileSync("f1(99).txt", "f1(99).txt")
		assert.strictEqual(fileSystemSync.ensureNotExists("f1(99).txt", "(0)"), "f1(100).txt")
	}

	export function ensureDirExistsTest() {
		fileSystemSync.ensureDirExists("foo/goo.txt")
		assert.strictEqual(fs.existsSync("foo"), true)

		fileSystemSync.ensureDirExists("foo/goo.txt")
	}

	export function createDirTest() {
		fileSystemSync.createDir("foo/goo")
		assert.strictEqual(fs.existsSync("foo/goo"), true)

		fileSystemSync.createDir("foo/goo")
	}

	export function createTempDirTest() {
		assert.strictEqual(fs.existsSync(fileSystemSync.createTempDir(rootDir)), true)
	}

	export function deleteDirTest() {
		assert.strictEqual(fs.existsSync("dir1"), true)
		assert.strictEqual(fileSystemSync.deleteDir("dir1"), 3)
		assert.strictEqual(fs.existsSync("dir1"), false)

		assert.strictEqual(fileSystemSync.deleteDir("dir1"), 0)
	}

	export function cleanDirTest() {
		assert.strictEqual(fileSystemSync.cleanDir("dir1"), 3)
		assert.strictEqual(fs.existsSync("dir1"), true)
		assert.strictEqual(fs.existsSync("dir1/sub2"), false)

		assert.strictEqual(fileSystemSync.cleanDir("dir1/sub3"), 0)
		assert.strictEqual(fileSystemSync.cleanDir("dir1/404"), 0)
	}

	export function deleteParentDirIfEmptyTest() {
		assert.strictEqual(fileSystemSync.deleteParentDirIfEmpty("dir1/sub3/foo.txt"), 0)
		assert.strictEqual(fs.existsSync("dir1/sub3"), false)

		assert.strictEqual(fileSystemSync.deleteParentDirIfEmpty("dir1/sub1/foo.txt"), 0)
		assert.strictEqual(fs.existsSync("dir1/sub1"), true)

		assert.strictEqual(fileSystemSync.deleteParentDirIfEmpty("dir2/foo.txt"), 1)
		assert.strictEqual(fs.existsSync("dir2"), false)

		fs.mkdirSync("empty1")
		fs.mkdirSync("empty1/empty2")
		assert.strictEqual(fileSystemSync.deleteParentDirIfEmpty("empty1/empty2/foo.txt"), 2)
		assert.strictEqual(fs.existsSync("empty1"), false)
	}

	export function deleteFileTest() {
		assert.strictEqual(fileSystemSync.deleteFile("f1.txt"), true)
		assert.strictEqual(fs.existsSync("f1.txt"), false)

		assert.strictEqual(fileSystemSync.deleteFile("404.txt"), false)
	}

	export function walkTest() {
		const dirs: string[] = []
		const files: string[] = []
		fileSystemSync.walk(".", {
			error(e) {
				assert.ifError(e)
			},
			dir(p) {
				dirs.push(path.relative(rootDir, p).replace(/\\/g, "/"))
			},
			file(p) {
				files.push(path.relative(rootDir, p).replace(/\\/g, "/"))
			},
			other() {

			}
		})
		assert.deepStrictEqual(dirs.sort(), ["", "dir1", "dir1/sub1", "dir1/sub2", "dir2"])
		assert.deepStrictEqual(files.sort(), ["dir1/sub1/f3.txt", "dir1/sub1/f4.txt", "dir1/sub2/f5.txt", "f1.txt", "f2.txt"])

		fileSystemSync.walk("404", {})
	}

	export function globTest() {
		assert.deepStrictEqual((fileSystemSync.glob("*")).sort().map(p => path.relative(rootDir, p).replace(/\\/g, "/")), ["dir1/sub1/f3.txt", "dir1/sub1/f4.txt", "dir1/sub2/f5.txt", "f1.txt", "f2.txt"])
		assert.deepStrictEqual((fileSystemSync.glob("dir1")).sort().map(p => path.relative(rootDir, p).replace(/\\/g, "/")), ["dir1/sub1/f3.txt", "dir1/sub1/f4.txt", "dir1/sub2/f5.txt"])
		assert.deepStrictEqual((fileSystemSync.glob(["dir1", "!dir1"])), [])
	}

	export function readDirTest() {
		assert.deepStrictEqual(fileSystemSync.readDir("."), ["dir1", "dir2", "f1.txt", "f2.txt"])
	}

	export function readFileTest() {
		assert.strictEqual(fileSystemSync.readFile("f1.txt", "utf-8"), "f1.txt")
		assert.strictEqual(fileSystemSync.readFile("dir1/sub1/f4.txt", "utf-8"), "f4.txt")

		assert.strictEqual((fileSystemSync.readFile("f1.txt")).toString(), "f1.txt")
	}

	export function readTextTest() {
		assert.strictEqual(fileSystemSync.readText("f1.txt"), "f1.txt")
		assert.strictEqual(fileSystemSync.readText("dir1/sub1/f4.txt"), "f4.txt")

		assert.strictEqual(fileSystemSync.readText("404", false), null)
	}

	export function writeFileTest() {
		assert.strictEqual(fileSystemSync.writeFile("foo/goo.txt", "A"), true)
		assert.strictEqual(fs.readFileSync("foo/goo.txt", "utf-8"), "A")

		assert.strictEqual(fileSystemSync.writeFile("foo/goo.txt", "你好"), true)
		assert.strictEqual(fs.readFileSync("foo/goo.txt", "utf-8"), "你好")

		assert.strictEqual(fileSystemSync.writeFile("foo/goo.txt", "你不好", false), false)
		assert.strictEqual(fs.readFileSync("foo/goo.txt", "utf-8"), "你好")

		assert.throws(() => { fileSystemSync.writeFile("dir1", "你好", true) })
	}

	export function appendFileTest() {
		fileSystemSync.appendFile("foo/goo.txt", "A")
		assert.strictEqual(fs.readFileSync("foo/goo.txt", "utf-8"), "A")
		fileSystemSync.appendFile("foo/goo.txt", "你好")
		assert.strictEqual(fs.readFileSync("foo/goo.txt", "utf-8"), "A你好")
	}

	export function createLinkTest() {
		assert.strictEqual(fileSystemSync.createLink("lnk", "f1.txt"), true)
		assert.strictEqual(fileSystemSync.createLink("lnk", "f2.txt", false), false)

		assert.strictEqual(fileSystemSync.readFile("lnk", "utf-8"), "f1.txt")

		assert.strictEqual(fileSystemSync.createLink("lnk2", "dir1"), true)
		assert.strictEqual(fileSystemSync.readFile("lnk2/sub2/f5.txt", "utf-8"), "f5.txt")
	}

	export function copyDirTest() {
		assert.strictEqual(fileSystemSync.copyDir("dir1", "foo/copydir"), 3)
		assert.strictEqual(fs.readFileSync("foo/copydir/sub1/f3.txt", "utf-8"), "f3.txt")
		assert.strictEqual(fs.readFileSync("foo/copydir/sub1/f4.txt", "utf-8"), "f4.txt")
		assert.strictEqual(fs.readFileSync("foo/copydir/sub2/f5.txt", "utf-8"), "f5.txt")

		fs.writeFileSync("foo/copydir/sub2/f5.txt", "f5.txt_1")
		assert.strictEqual(fileSystemSync.copyDir("dir1", "foo/copydir", false), 0)
		assert.strictEqual(fs.readFileSync("foo/copydir/sub1/f3.txt", "utf-8"), "f3.txt")
		assert.strictEqual(fs.readFileSync("foo/copydir/sub1/f4.txt", "utf-8"), "f4.txt")
		assert.strictEqual(fs.readFileSync("foo/copydir/sub2/f5.txt", "utf-8"), "f5.txt_1")
	}

	export function copyFileTest() {
		assert.strictEqual(fileSystemSync.copyFile("f1.txt", "foo/copyf1.txt"), true)
		assert.strictEqual(fs.readFileSync("foo/copyf1.txt", "utf-8"), "f1.txt")

		fs.writeFileSync("foo/copyf1.txt", "f1.txt_1")
		assert.strictEqual(fileSystemSync.copyFile("f1.txt", "foo/copyf1.txt", false), false)
		assert.strictEqual(fs.readFileSync("foo/copyf1.txt", "utf-8"), "f1.txt_1")

		assert.throws(() => fileSystemSync.copyFile("404.txt", "goo/copyf1.txt", true))
	}

	export function copyLinkTest() {
		assert.strictEqual(fileSystemSync.createLink("lnk", "f2.txt"), true)
		assert.strictEqual(fileSystemSync.copyLink("lnk", "move-link"), true)
		assert.strictEqual(fileSystemSync.readFile("move-link", "utf-8"), "f2.txt")
	}

	export function moveDirTest() {
		assert.strictEqual(fileSystemSync.moveDir("dir1", "foo/movedir"), 3)
		assert.strictEqual(fs.existsSync("dir1"), false)
		assert.strictEqual(fs.readFileSync("foo/movedir/sub1/f3.txt", "utf-8"), "f3.txt")
		assert.strictEqual(fs.readFileSync("foo/movedir/sub1/f4.txt", "utf-8"), "f4.txt")
		assert.strictEqual(fs.readFileSync("foo/movedir/sub2/f5.txt", "utf-8"), "f5.txt")

		fs.writeFileSync("foo/movedir/sub2/f5.txt", "f5.txt_1")
		assert.strictEqual(fileSystemSync.moveDir("foo/movedir", "foo/movedir", false), 0)
		assert.strictEqual(fs.readFileSync("foo/movedir/sub1/f3.txt", "utf-8"), "f3.txt")
		assert.strictEqual(fs.readFileSync("foo/movedir/sub1/f4.txt", "utf-8"), "f4.txt")
		assert.strictEqual(fs.readFileSync("foo/movedir/sub2/f5.txt", "utf-8"), "f5.txt_1")
	}

	export function moveFileTest() {
		assert.strictEqual(fileSystemSync.moveFile("f1.txt", "foo/movef1.txt"), true)
		assert.strictEqual(fs.existsSync("f1.txt"), false)
		assert.strictEqual(fs.readFileSync("foo/movef1.txt", "utf-8"), "f1.txt")

		assert.strictEqual(fileSystemSync.moveFile("foo/movef1.txt", "foo/movef1.txt", false), false)
		assert.strictEqual(fs.readFileSync("foo/movef1.txt", "utf-8"), "f1.txt")
	}

	export function moveLinkTest() {
		assert.strictEqual(fileSystemSync.createLink("lnk", "f2.txt"), true)
		assert.strictEqual(fileSystemSync.moveLink("lnk", "move-link"), true)
		assert.strictEqual(fileSystemSync.readFile("move-link", "utf-8"), "f2.txt")
	}

	export function getRealPathTest() {
		assert.strictEqual(path.relative(process.cwd(), fileSystemSync.getRealPath("f1.txt")), "f1.txt")
		assert.strictEqual(path.relative(process.cwd(), fileSystemSync.getRealPath("F1.txt")), "f1.txt")

		assert.strictEqual(fileSystemSync.getRealPath("404.txt"), null)
	}

	export namespace errorTest {

		for (const key in fileSystemSyncTest) {
			if (key !== "beforeEach" && key !== "afterEach" && typeof fileSystemSyncTest[key] === "function" && key !== "ensureNotExistsTest" && key !== "deleteParentDirIfEmptyTest") {
				errorTest[key] = () => {
					simulateIOError(() => {
						assert.throws(fileSystemSyncTest[key])
					})
				}
			}
		}

	}

}