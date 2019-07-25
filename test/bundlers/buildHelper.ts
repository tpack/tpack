import * as builder from "../../src/core/builder"
import { LogLevel } from "../../src/utils/logger"
import { MemoryFileSystem } from "../../src/utils/memoryFileSystem"

export async function build(files: { [name: string]: string | Buffer }) {
	const b = new builder.Builder({
		rootDir: "",
		outDir: "",
		match: ["main.*", "entries"],
		noPathCheck: true,
		compilers: [],
		optimizers: [],
		sourceMap: false,
		logger: { logLevel: LogLevel.silent, progress: false },
		fs: new MemoryFileSystem()
	})
	for (const key in files) {
		await b.fs.writeFile(key, files[key])
	}
	const r = await b.build()
	const mainEntry = r.entryModules.find(module => module.matchOriginal("main.*"))
	return mainEntry ? mainEntry.generatedModules[0] : null
}