# H2Server
Command line HTTP2 server tool for serving up local files.

## Installation
Installation via npm:
```
npm install h2server -g
```
This will install `h2server` globally so that it may be run from the command line.

## Usage

### Basic
```
h2server [url] [options]
```

For examples:
`h2server 8080 -o` Will start a http 1.1 server and open `http://localhost:8080` in browser.
`h2server https://0.0.0.0` Will start a h2 server using the default self-signed certificate.

## Options
- `--open`, `-o`: Open browser after starting the server
- `--help`, `-h`, `-?`: Print helps
- `--cors`: Enable CORS via the Access-Control-Allow-Origin header
- `--proxy`, `-p`: Proxies all requests which can't be resolved locally to the given url. e.g.: -p http://someurl.com
- `--cert`: Path to ssl cert file
- `--key `: Path to ssl key file
- `--version`, `-v`: Print version