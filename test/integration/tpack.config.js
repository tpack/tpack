export default {
	rootDir: "fixtures",
	outDir: "out",
	compilers: [
		...require("tpack/configs/compilers.json"),
	],
	optimize: true,
	optimizers: [
		{ match: "uglify-js/**/*.js", use: "../optimizers/js" },
		{ match: "cleancss/**/*.css", use: "../optimizers/css" },
		{ match: "html-minifier/**/*.html", use: "tpack/optimizers/html" },
	],
	plugins: [
		new (require("tpack/plugins/saveErrorAndWarning").default)()
	],
	sourceMap: true
}