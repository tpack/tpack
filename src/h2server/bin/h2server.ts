#!/usr/bin/env node
import { WebServer } from '../../server/webServer'
import { ANSIColor, color } from '../../utils/ansi'
import { FileSystem } from '../../utils/fileSystem'
import { parseCommandLineArguments, formatCommandLineOptions, CommandLineOption } from '../../utils/commandLine'

const fs = new FileSystem()
const commandOptions: { [option: string]: CommandLineOption } = {
	'--port': {
		description: 'Port to use [auto]',
		alias: ['-p'],
		argument: 'port',
		group: 'host'
	},
	'--address': {
		description: 'Address to use [0.0.0.0]',
		alias: ['-a'],
		argument: 'address'
	},
	'--host': {
		description: 'Serve Address to use [0.0.0.0]:[auto]',
		argument: 'host'
	},
	'--open': {
		description: `Open browser window after starting the server\nOptionally provide a URL path to open the browser window to`,
		alias: ['-o'],
		argument: 'path',
		group: 'test'
	},
	'--no-dir': {
		description: 'Do not show directory list'
	},
	'--root-dir': {
		description: '',
		argument: 'path'
	},
	'--root-path': {
		description: '',
		argument: 'path'
	},
	'--index': {
		multiple: true,
		argument: 'fileName',
		description: 'main file'
	},
	'--help': {
		description: 'Print this list and exit',
		alias: ['-h', '-?']
	}
}
const argv = parseCommandLineArguments(commandOptions)
if (argv['--help']) {
	console.log([
		'Usage: h2server [path] [options]',
		'',
		'options:',
		formatCommandLineOptions(commandOptions)
	].join('\n'))
	process.exit()
}

const open = argv['--open']
const port = argv['--port'] || ''
const address = argv['--address'] || ''
const rootServe = argv['--root-path'] || '/'
const rootDir = argv['--root-dir'] as string
const url = argv['--host'] as string || `${address}${port ? `:${port}` : ''}${rootServe}`

console.log(argv)
const logger = {
	log: (argv.silent || argv.s) ? function () {} : console.log,
	info: (text: string) => logger.log(color(text, ANSIColor.blue)),
	error: (text: string) => logger.log(color(text, ANSIColor.red)),
	warn: (text: string) => logger.log(color(text, ANSIColor.yellow)),
	success: (text: string) => logger.log(color(text, ANSIColor.green))
}

const server = new WebServer({
	url,
	http2: !!(url && /^https:/i.test(url)),
	directoryList: !argv['--no-dir'],
	open: !!open,
	rootDir,
	routers: [
		{
			match: '**',
			async process(req, res, server) {
				if (req.path === '/favicon.ico') return res.end()

				const isFile = await fs.existsFile(server.mapPath(req.path)!)
				if(isFile) {
					// TODO
				}
				else {
					const fileList = await fs.readDir(server.mapPath(req.path)!)
					fileList.find()
					server.defaultPages
				}
				res.end()
			}
		},
		{
			match: '*.ejs',
			async process(req, res, server) {
				await server.writeEJS(req, res, server.mapPath(req.path)!)
			}
		},
		{
			match: '*.njs',
			async process(req, res, server) {
				await server.writeServerJS(req, res, server.mapPath(req.path)!)
			}
		}
	],
	defaultPages: argv['--index'] as string[]
})

server.start().then(() => {
	console.log(color(`Server Running At ${server.rootUrl}`, ANSIColor.green))
	console.log('Hit CTRL-C to stop the server')
})