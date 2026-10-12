/** Local static-export server for browser smoke tests. Not shipped in the installer. */
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '../out')
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2'
}

http
  .createServer((request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url || '/', 'http://localhost').pathname)
      const file = path.resolve(root, `.${pathname}`, pathname.endsWith('/') ? 'index.html' : '')
      if (!file.startsWith(`${root}${path.sep}`) || !fs.statSync(file).isFile()) {
        response.writeHead(404).end('Not found')
        return
      }
      response.writeHead(200, {
        'content-type': contentTypes[path.extname(file)] || 'application/octet-stream'
      })
      fs.createReadStream(file).pipe(response)
    } catch {
      response.writeHead(404).end('Not found')
    }
  })
  .listen(3000, '127.0.0.1', () => console.log('Static UI test site listening on :3000'))
