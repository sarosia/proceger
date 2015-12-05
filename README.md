# Proceger

[![Build Status][travis-image]][travis-url]
[![NPM Version][npm-image]][npm-url]
[![NPM Downloads][downloads-image]][downloads-url]

A process manager with web interface.

## Install

```sh
$ npm install -g proceger
```

Proceger depends on [Node.js](http://nodejs.org/) and [npm](http://npmjs.org/).

## Usage

You need to first create a .proceger.json in the user home directory with the following content.

```json
{
    "processes": [
        {
            "name": "ls",
            "command": "ls",
            "args": [ "-ltr" ]
        }
    ]
}
```

Start the application by running the following command.

```sh
$ proceger 
```

You can access the proceger webapp by browsing http://localhost:8001.

## License

[MIT](LICENSE)

[npm-image]: https://img.shields.io/npm/v/proceger.svg
[npm-url]: https://npmjs.org/package/proceger
[downloads-image]: https://img.shields.io/npm/dm/proceger.svg
[downloads-url]: https://npmjs.org/package/proceger
[travis-image]: https://travis-ci.org/sarosia/proceger.svg?branch=master
[travis-url]: https://travis-ci.org/sarosia/proceger
