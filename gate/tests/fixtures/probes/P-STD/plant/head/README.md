# greet

Prints a greeting.

## Usage

    node src/greet.mjs <name>

To check a name without printing anything, which is useful in scripts that
only want the exit status and would otherwise have to throw the greeting
away, the quiet flag can be passed, and then nothing is printed.

## Flags

| Flag | Default | What it does |
| --- | --- | --- |
| `--shout` | off | Prints the greeting in capitals. |
