import { readFileSync } from "fs"
import { extname } from "path"

/** 所有扩展名（含点）到图标的映射表 */
export const icons = JSON.parse(readFileSync(__dirname + "/data/icons/index.json", "utf-8")) as typeof import("./data/icons/index.json")
Object.setPrototypeOf(icons.extensions, null)
Object.setPrototypeOf(icons.extendedExtensions, null)
Object.setPrototypeOf(icons.fileNames, null)
Object.setPrototypeOf(icons.dirNames, null)

const fileIcons = new Map<string, string>()
const dirIcons = new Map<string, string>()
const defaultIcons = new Map<string, string>()

/**
 * 获取文件的 SVG 图标
 * @param fileName 文件名
 */
export function getFileIcon(fileName: string) {
	const icon = icons.fileNames[fileName as keyof typeof icons.fileNames] || /\..+\..+$/.test(fileName) && icons.extendedExtensions[/\..+\..+$/.exec(fileName)![0] as keyof typeof icons.extendedExtensions] || icons.extensions[extname(fileName) as keyof typeof icons.extensions]
	if (icon) {
		return readIcon("file", icon, fileIcons)
	}
	return getDefaultIcon("file")
}

/**
 * 获取文件夹的 SVG 图标
 * @param dirName 文件夹名
 */
export function getDirIcon(dirName: string) {
	const icon = icons.dirNames[dirName as keyof typeof icons.dirNames]
	if (icon) {
		return readIcon("dir", icon, dirIcons)
	}
	return getDefaultIcon("dir")
}

/**
 * 获取默认图标
 * @param type 图标类型
 */
export function getDefaultIcon(type: "back" | "dir" | "file" | "home" | "root") {
	return readIcon("default", type, defaultIcons)
}

/** 读取图标数据 */
function readIcon(dir: string, name: string, cache: Map<string, string>) {
	let icon = cache.get(name)
	if (!icon) {
		cache.set(name, icon = readFileSync(`${__dirname}/data/icons/${dir}/${name}.svg`, "utf-8"))
	}
	return icon
}