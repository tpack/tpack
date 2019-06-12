import { Builder } from "../core/builder"
import { VFile, VFileLogEntry } from "../core/vfile"

export default class {
	apply(builder: Builder) {
		const generated: string[] = []
		builder.on("buildError", (log: VFileLogEntry, file: VFile) => saveLog("error", log, file))
		builder.on("buildWarning", (log: VFileLogEntry, file: VFile) => saveLog("warning", log, file))
		builder.on("buildStart", async () => {
			for (const file of generated) {
				await builder.fs.deleteFile(file)
			}
		})

		async function saveLog(type: string, log: VFileLogEntry, file: VFile) {
			const path = builder.getOutputPath(file.originalPath).replace(/\.[^\.]+$/, ".errors.json")
			const data = await readJSON(path) || []
			log = {
				...log,
				type: type,
				fileName: builder.relativePath(log.fileName!)
			} as any
			delete log.error
			data.push(log)
			await writeJSON(path, data)
			generated.push(path)
		}

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