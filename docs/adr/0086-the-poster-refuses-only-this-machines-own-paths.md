# The poster refuses only this machine's own paths

The poster no longer refuses a path by its shape. `path/local` is gone; `path/machine` stays, and refuses this machine's home and temp folders, its user name and its host name (#326).

## Why

- **The shape rule refused far more harmless text than it caught.** A drive letter, a network share or a `/home/<name>` path is ordinary in a review: it withheld whole lens reports and refused prose, the first draft of #326 among them.
- **What a path can reveal about the owner is this machine's own names.** `path/machine` still guards those, and the review procedure's read before posting still looks for them.

## What stays

`path/machine`, its forms and its tests; every other scan rule; the read before posting. The risk that some other revealing path, such as a project kept under a folder whose name says something about its owner, reaches the record is accepted in the threat model on the owner's word.
