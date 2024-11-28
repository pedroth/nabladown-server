# Nabladown server

Nabladown server is a computer application that lets you view [nabladown][nabla] files, through a hot reloading server.

![](/nabla-server.webp)

# Quick start

## Executable (windows and linux)

Download the lastest executable from the [release page](https://github.com/pedroth/nabladown-server/releases), and run it.
## npx

The simplest way to run this is to use `npx` in a folder with [nabladown files][nabla]:

`npx nabladown-server`

Then open browser at `http://localhost:3000`. It will display a list of all `.nd` files, in the folder where the first command was run.

Then use any editor to change your files. The documents will update accordingly.

## bunx

You can also use `bunx`

`bunx nabladown-server`

Or

`bunx nabladown-server@latest`

> If there is some error try to install it globally using `bun i -g nabladown-server`, and then try again.

# Advanced 

## Change port

It is possible to change the port:

`npx nabladown-server -p 8080`

The above command will run the server on port `8080`.

## Add your style

Just create an `index.css` file in your _root_ folder.

To disable this default behavior, just run: `npx nabladown-server -no-css`


[nabla]: https://pedroth.github.io/nabladown.js

# TODO

- Offline mode
- Low priority
	- Create files
	- Delete files
	- Rename files
	- Create folders
	- Delete folders
	- Rename folders
