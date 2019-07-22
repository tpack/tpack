import { Builder } from "../core/builder"
import { Module, ModuleLogEntry } from "../core/module"

export default class {
	apply(builder: Builder) {
		const generated: string[] = []
		builder.on("buildLog", async (log: ModuleLogEntry, module: Module) => {
			const path = builder.getOutputPath(module.originalPath).replace(/\.[^\.]+$/, ".logs.json")
			const data = await readJSON(path) || []
			log = {
				...log,
				fileName: builder.relativePath(log.fileName!)
			} as any
			data.push(log)
			await writeJSON(path, data)
			generated.push(path)
		})
		builder.on("buildStart", async () => {
			if (!builder.clean) {
				try {
					for (const file of await builder.fs.glob("*.logs.json", builder.outDir)) {
						await builder.fs.deleteFile(file)
					}
				} catch { }
			}
			for (const file of generated) {
				await builder.fs.deleteFile(file)
			}
		})

		async function readJSON(path: string) {
			try {
				return JSON.parse(await builder.fs.readFile(path, "utf-8"))
			} catch {
				return undefined
			}
		}

		async function writeJSON(path: string, data: any) {
			await builder.fs.writeFile(path, JSON.stringify(data, undefined, 2))
		}
	}
}