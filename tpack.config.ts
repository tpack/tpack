import { BuilderOptions } from "./src/core/options"
import { Builder } from "./src/core/builder"
import { exec } from "./src/utils/process"
import { request } from "./src/utils/request"
import { writeFile } from "./src/utils/fileSystemSync"

export default function () {
	return build()
}

export function build() {
	return {
		rootDir: ".",
		outDir: "dist",
		match: ["./src", "!./src/tsconfig.json", "./locales", "./configs", "./data", "./package.json", "./README.md", "./LICENSE"],
		compilers: [
			{
				match: "src/**/*",
				outPath: "<path>"
			},
			{
				match: "./package.json",
				process(file) {
					file.content = file.content.replace(/\.\/dist\//g, "./")
				}
			},
			{
				match: "*.ts",
				use: [{
					process(file) {
						file.content = file.content.replace(/\.\.\/(\.\.\/|package)/g, "$1")
					}
				}, {
					use: "./src/compilers/typescript",
					options: { path: "./tsconfig.json", noTypeCheck: true, declaration: true, target: "es2018", module: "commonjs" }
				}]
			},
		],
		bundler: {
			target: "node"
		},
		sourceMap: true
	} as BuilderOptions
}

export function watch() {
	return {
		...build(),
		watch: true
	} as BuilderOptions
}

export async function test() {
	await exec("npm run test --silent")
}

export async function coverage() {
	await exec("npm run coverage --silent")
}

export async function updateMimeTypes() {
	const mimeTypes = {}
	const db = JSON.parse(await request("https://raw.githubusercontent.com/jshttp/mime-db/master/db.json")) as { [mimeType: string]: { extensions?: string[] } }
	// image/jpeg 优先考虑 .jpg，而非 .jpeg
	try {
		const jpgIndex = db["image/jpeg"].extensions.indexOf("jpg")
		if (jpgIndex > 0) {
			db["image/jpeg"].extensions.splice(jpgIndex, 1)
			db["image/jpeg"].extensions.unshift("jpg")
		}
	} catch { }
	Object.entries(db).forEach(([mimeType, props]) => {
		if (props.extensions) {
			props.extensions.forEach(ext => {
				mimeTypes[ext] = mimeTypes[ext] || mimeType
			})
		}
	})
	// .ts 改用 typescript，而非视频流
	mimeTypes[".tsx"] = mimeTypes[".ts"] = mimeTypes[".js"] = "text/javascript"
	mimeTypes[".ico"] = "image/x-icon"
	// 很多社区框架使用 . 开头的文件名为配置文件，这些配置文件使用文本类型
	const icons = require("./src/server/data/icons/index.json")
	Object.keys(icons.fileNames).forEach(icon => {
		if (icon.startsWith(".") && !icon.includes(".", 1)) {
			mimeTypes[icon.substring(1)] = "text/plain"
		}
	})
	mimeTypes["licence"] = mimeTypes["license"] = "text/plain"
	writeFile("./src/server/data/mimeTypes.json", JSON.stringify(mimeTypes, undefined, "\t"))
}

// 允许直接执行配置文件
if (process.mainModule === module) {
	run(process.argv[2] || "default")

	async function run(task: string) {
		const options = await exports[task]()
		if (typeof options === "object") {
			new Builder(options).run()
		}
	}
}