# Nabladown server

Nabladown server is a computer application that lets you view [nabladown][nabla] files, through a hot reloading.

![](/nabla-server.webp)

# Quickstart

Simplest way to run this is to use `npx`:

`npx nabladown-server`

Then open browser at `http://localhost:3000`. It will display a list of all `.nd` files, in the folder where the first command was ran.

You can also use `bunx`

`bunx nabladown-server`

> If there is some error try to install it globally using `bun i -g nabladown-server`, and then try again.

# Advanced 

It is possible to change the port:

`npx nabladown-server -p 8080`

The command above will run the server in the port `8080`.

[nabla]: https://pedroth.github.io/nabladown.js


# TODO

- Create browser editor
- Using custom nabladown render
