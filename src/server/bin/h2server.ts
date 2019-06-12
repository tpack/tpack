#!/usr/bin/env node

var WebServer = require('../webServer.js').WebServer;

if (process.argv[2] === "-h" || process.argv[2] === "--help" || process.argv[2] === "-?") {
	console.log("Usage: h2server")
	console.log("       h2server 8080")
	console.log("       h2server https://0.0.0.0:8000 --open")
	return
}

var url = process.argv[2] === "--open" || process.argv[2] === "-o" ? undefined : process.argv[2]
var open = process.argv[2] === "--open" || process.argv[2] === "-o" || process.argv[3] === "--open" || process.argv[3] === "-o"

var server = new WebServer({
    url: url,
	http2: url && /^https:/i.test(url),
	directoryList: true,
	open: open,
	routers: [
		{
			match: "*.ejs",
			async process(req, res, server) {
				await server.writeEJS(req, res, server.mapPath(req.path))
			}
		},
		{
			match: "*.njs",
			async process(req, res, server) {
				await server.writeServerJS(req, res, server.mapPath(req.path))
			}
		}
	]
});

server.start().then(() => {
	console.log("Server Running At " + server.rootUrl)
})