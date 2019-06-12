export default function (args) {
	return {
		rootDir: require("path").resolve(require("fs").existsSync("src") ? "src" : ""),
		devServer: !args["--filter"] && !args["--watch"]
	}
}