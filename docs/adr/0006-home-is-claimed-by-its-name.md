# Another window claims Home by its name: `Home` plus a zero-width space

Home's id is recorded only in this machine's `shared.json`, while spaces live in the core, so another window on the same core doesn't know it. So Home's name is `Home` plus a zero-width space (`​`): it reads as Home everywhere, and nobody can type it. While `t3-tabs` doesn't know Home yet, it takes as Home only a space on this machine with an explicit name that is exactly the same; an existing Home is renamed to this name.

## Considered Options

- **A visible reserved name, such as `t3-home`**: Go to and the Inbox show space names, so users would see it.
- **"Named Home and has a `t3-home` pane"**: the default page can be closed, and a user's space can have that pane too.

A wrong match hides a user's space, while a missed one at most adds an extra Home, so only a strict match is taken.
