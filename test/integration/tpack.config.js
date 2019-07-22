export default {
	rootDir: "fixtures",
	outDir: "dist",
	compilers: [
		...require("tpack/configs/compilers.json"),
	],
	optimize: true,
	optimizers: [
		{ match: "uglify-js/**/*.js", use: "tpack/optimizers/js" },
		{ match: "cleancss/**/*.css", use: "tpack/optimizers/css" },
		{ match: "html-minifier/**/*.html", use: "tpack/optimizers/html" },
	],
	parallel: 0,
	plugins: [
		new (require("tpack/plugins/saveLogs").default)()
	],
	sourceMap: true,
	devServer: true
}