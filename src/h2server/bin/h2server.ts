#!/usr/bin/env node
import { WebServer } from '../../server/webServer'
import { ANSIColor, color } from '../../utils/ansi'
import { HTTPRequest, HTTPResponse } from '../../utils/httpServer'
import { parseCommandLineArguments, formatCommandLineOptions, CommandLineOption } from '../../utils/commandLine'

const commandOptions: { [option: string]: CommandLineOption } = {
	// host
	'--host': {
		group: 'host',
		argument: 'host',
		description: 'Serve Address to use [0.0.0.0]:[auto]'
	},
	'--port': {
		alias: ['-p'],
		argument: 'port',
		description: 'Port to use [auto]'
	},
	'--address': {
		alias: ['-a'],
		argument: 'address',
		description: 'Address to use [0.0.0.0]'
	},

	// browser
	'--open': {
		group: 'browser',
		alias: ['-o'],
		argument: 'path',
		default: true,
		description: `Open browser window after starting the server\nOptionally provide a URL path to open the browser window to`
	},
	'--open-url': {
		argument: 'path',
		default: '',
		description: `provide a URL path to open the browser window to`
	},
	'--open-client': {
		argument: 'app',
		default: '',
		description: `default browser`
	},
	'--no-dir': {
		description: 'Do not show directory list'
	},

	// logger
	'--utc': {
		group: 'logger',
		alias: ['-U'],
		description: 'Use UTC time format in log messages'
	},
	'--log-ip': {
		description: 'Enable logging of the client\'s IP address'
	},
	'--silent': {
		alias: ['-s'],
		description: 'Suppress log messages from output'
	},

	// server
	'--cwd': {
		group: 'server',
		argument: 'path',
		description: 'cwd'
	},
	'--root-path': {
		argument: 'path',
		description: ''
	},
	'--index': {
		multiple: true,
		argument: 'fileName',
		description: 'main file'
	},
	'--ssl': {
		alias: ['-S'],
		description: 'Enable https'
	},
	'--cert': {
		alias: ['-C'],
		argument: 'filePath',
		default: '',
		description: 'Path to ssl cert file (default: cert.pem).'
	},
	'--key': {
		alias: ['-K'],
		argument: 'filePath',
		default: '',
		description: 'Path to ssl key file (default: key.pem)'
	},
	'--http2': {
		alias: ['-H2'],
		description: 'Enable http2'
	},
	'--max-length': {
		argument: 'maxAllowedContentLength',
		description: 'max allowed content length (default: 20 * 1024 * 1024)'
	},
	'--help': {
		alias: ['-h', '-?'],
		description: 'Print this list and exit'
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

const port = argv['--port'] || ''
const address = argv['--address'] || ''
const rootServe = argv['--root-path'] || '/'
const rootDir = argv['--cwd'] as string
const openURL = argv['--open-url'] as string
const open = (argv['--open'] as string | boolean)
const url = typeof open === 'string' ? open : '' || argv['--host'] as string || `${address}${port ? `:${port}` : ''}${rootServe}`

const logger = {
	log: argv['--silent'] ? function () {} : console.log,
	info: (text: string, ...args: any[]) => logger.log(color(text, ANSIColor.blue), ...args),
	request: (request: HTTPRequest, response: HTTPResponse, server: WebServer) => {
		const date = argv['--utc'] ? new Date().toUTCString() : new Date()
		const ip = argv['--log-ip'] ? request.headers['x-forwarded-for'] || '' + request.connection.remoteAddress : ''
		logger.info(
			'[%s] %s "%s %s" "%s"',
			date, ip, color(request.method, ANSIColor.cyan), color(request.url, ANSIColor.cyan),
			request.headers['user-agent']
		)
	}
}

const server = new WebServer({
	url,
	https: !!argv['--https'],
	http2: !!argv['--http2'] || !!(url && /^https:/i.test(url)),
	cert: argv['--cert'] as string,
	key: argv['--key'] as string,
	open: argv['--open-client'] as string || !!open || openURL,
	openURL,
	rootDir,
	routers: [
		{
			match: '**',
			async process(req, res, server) {
				logger.request(req, res, server)
			},
			break: false
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
	defaultPages: argv['--index'] as string[],
	directoryList: !argv['--no-dir'],
	maxAllowedContentLength: typeof argv['--max-length'] === 'string' ? parseInt(argv['--max-length'] as string, 10) : undefined
})

server.start().then(() => {
	console.log(color(`Server Running At ${server.rootUrl}`, ANSIColor.green))
	console.log('Hit CTRL-C to stop the server')
})