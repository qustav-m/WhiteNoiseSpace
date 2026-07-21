# Style Guide

## Naming

- **Self-explanatory names** — names must describe what they are or do without needing a comment. If you need a comment to explain a name, rename it instead.
- **No non-scientific abbreviations** — `BPM`, `RGB`, `FPS` are fine (established domain terms). `ctx`, `pos`, `btn`, `t` are not. Write the full word.
- **camelCase** — `isNameShowingYouCasing`. No snake_case, no PascalCase for variables or functions.

## Formatting

- **No alignment spacing** — `x = 5` not `x   = 5`. One space before `=`, `//`, and other operators. Never pad to align multiple lines.

## Comments

- Only comment the **why**, not the what. Well-named identifiers describe what the code does.
- For non-obvious math or behavior, one short line is enough.
