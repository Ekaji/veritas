---
description: How to run commands in WSL on Windows
---

# Running Commands in WSL

The default terminal on Windows is CMD, which cannot handle UNC paths to WSL and causes commands to hang.

## Fix: Change Default Terminal

1. In the terminal panel, click the **dropdown arrow (▾)** next to the **+** button
2. Click **"Select Default Profile"**
3. Choose **"Ubuntu-22.04 (WSL)"**
4. Restart Antigravity or close/reopen the terminal

## Alternative Fix (if above doesn't work)

Wrap commands using the `cmd /c` pattern:

```
cmd /c <your_command> & ::
```

This executes the command and absorbs any trailing garbage characters.

## Notes

- The project lives in WSL at `/home/ekaji/projects/veritas`
- All Rust/Solana/Anchor commands must run in a Linux shell
  // turbo-all
