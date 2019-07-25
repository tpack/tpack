import { extname, resolve } from "path"
import { registerESMLoader, unregisterESMLoader } from "../utils/require"

/** 所有支持的文件扩展名 */
export const extensions: { [ext: string]: string } = {
	".mjs": "esm",
	".ts": "ts-node/register",
	".tsx": "ts-node/register",
	".coffee": "coffee-script/register"
}

/**
 * 载入一个配置文件
 * @param path 要载入的配置文件名
 * @param jsModule 是否支持 JS 文件中的 ES Module 语法
 */
export async function loadConfig(path: string, jsModule = true) {
	path = resolve(path)
	const ext = extname(path).toLowerCase()
	const js = jsModule && ext === ".js"
	let originalLoader: any
	if (js) {
		originalLoader = registerESMLoader()
	} else if (!originalLoader) {
		const loaderRegister = extensions[ext]
		if (loaderRegister) {
			require(loaderRegister)
		}
	}
	try {
		return require(path)
	} finally {
		if (js) {
			unregisterESMLoader(originalLoader)
		}
	}
}
