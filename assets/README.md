# assets/

Empty on purpose. The game draws every sprite procedurally at runtime
(see `sprites.js`), so it needs no art files to run.

To drop in real pixel art later, put sprite sheets here and register them in
the `SHEETS` manifest at the top of `sprites.js`. Any sheet that loads
successfully replaces the procedural version of that sprite; anything missing
silently falls back to the drawn one, so the game always runs.

Expected frame layout if you add sheets:

  player_<character>.png   4 rows (down, left, right, up) x 4 columns (walk cycle)
  tree.png                 1 row  x 3 columns (variants)
  house.png                1 row  x 2 columns (normal, prepared)
  villager.png             1 row  x 2 columns (idle, run)

Frame size is read from `SHEETS[name].frameW/frameH`.
