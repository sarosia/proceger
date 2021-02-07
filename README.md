# Proceger

[![Build Status][build-image]][build-url]
[![NPM Version][npm-image]][npm-url]
[![NPM Downloads][downloads-image]][downloads-url]

A process manager with web interface.

## Install

```sh
$ npm install -g proceger
```

Proceger depends on [Node.js](http://nodejs.org/) and [npm](http://npmjs.org/).

## Usage

You need to first create a .procegerrc in the user home directory with the following content.

```json
{
  "workspace": "/path/to/your/workspace",
  "tasks": [
    {
      "name": "google-calendar-syncer",
      "git": {
        "url": "git@github.com:sarosia/google-calendar-syncer.git"
      }
    }
  ]
}
```

Start the application by running the following command.

```sh
$ proceger
```

You can access the proceger webapp by browsing http://localhost:8080.

## License

[MIT](LICENSE)

[npm-image]: https://img.shields.io/npm/v/proceger.svg
[npm-url]: https://npmjs.org/package/proceger
[downloads-image]: https://img.shields.io/npm/dm/proceger.svg
[downloads-url]: https://npmjs.org/package/proceger
[build-image]: https://github.com/sarosia/heapset/workflows/CI/badge.svg
[build-url]: https://github.com/sarosia/heapset/actions
