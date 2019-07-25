export default function (args) {
	const isProject = require("fs").existsSync("src")
	return {
		rootDir: require("path").resolve(isProject ? "src" : ".")
	}
}