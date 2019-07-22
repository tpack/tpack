import { readFileSync } from "fs"
import { extname, resolve, delimiter } from "path"
import { transformESModuleToCommonJS } from "../utils/esm"
import { stripBOM } from "../utils/misc"

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
	// HACK 将当前程序所在路径添加到依赖搜索目录
	const globalDir = resolve(__dirname, "../../../")
	const Module = require("module")
	if (!Module._nodeModulePaths(path).includes(globalDir)) {
		process.env.NODE_PATH = process.env.NODE_PATH ? `${process.env.NODE_PATH}${delimiter}${globalDir}` : globalDir
		Module._initPaths()
	}
	const ext = extname(path).toLowerCase()
	const originalLoader = require.extensions[ext]
	const js = jsModule && ext === ".js"
	if (js) {
		require.extensions[".js"] = (module: any, filename) => module._compile(transformESModuleToCommonJS(stripBOM(readFileSync(filename, "utf8"))), filename)
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
			require.extensions[ext] = originalLoader
		}
	}
}