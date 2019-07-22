import { readFileSync } from "fs"

/** 所有扩展名（含点）到 MIME 类型的映射表 */
export const mimeTypes = Object.setPrototypeOf(JSON.parse(readFileSync(__dirname + "/data/mimeTypes.json", "utf-8")), null) as typeof import("./data/mimeTypes.json")

/**
 * 获取指定文件名对应的 MIME 类型，如果找不到则返回 `undefined`
 * @param path 要获取的文件名
 * @param customMimeTypes 所有自定义扩展名（含点）到 MIME 类型的映射表
 */
export function getMimeType(path: string, customMimeTypes?: { [ext: string]: string }) {
	let index = path.length
	while (--index >= 0) {
		const char = path.charCodeAt(index)
		if (char === 46 /*.*/) {
			break
		}
		if (char === 47 /*/*/ || char === 92 /*\*/) {
			index++
			break
		}
	}
	path = path.substring(index).toLowerCase()
	if (customMimeTypes) {
		const customMimeType = customMimeTypes[path]
		if (customMimeType !== undefined) {
			return customMimeType
		}
	}
	return mimeTypes[path as keyof typeof mimeTypes]
}

/**
 * 获取指定 MIME 类型对应的扩展名，如果找不到则根据 MIME 类型自动计算
 * @param mimeType 要获取的类型
 * @param customMimeTypes 所有自定义扩展名（含点）到 MIME 类型的映射表
 */
export function getExtByMimeType(mimeType: string, customMimeTypes?: { [ext: string]: string }) {
	for (const ext in customMimeTypes) {
		if (customMimeTypes[ext] === mimeType) {
			return ext
		}
	}
	for (const ext in mimeTypes) {
		if (mimeTypes[ext as keyof typeof mimeTypes] === mimeType) {
			return ext
		}
	}
	return `.${mimeType.substring(mimeType.lastIndexOf("/") + 1)}`
}